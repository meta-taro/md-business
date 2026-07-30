import type { ValidationError } from './types.js';

/**
 * Size guard for parsed frontmatter, covering both ways a small input can
 * describe an unreasonably large structure.
 *
 * *Depth*: several schemas describe recursive shapes (an array field whose
 * element type is itself a field definition), so a small `.md` file can declare
 * thousands of nesting levels. Both the key-normalisation pass and the compiled
 * validator walk that structure recursively, and either would exhaust the call
 * stack before reporting anything useful.
 *
 * *Breadth*: YAML aliases let one object appear at many positions at once, so a
 * few hundred bytes can describe hundreds of millions of distinct paths while
 * staying only a few levels deep. Everything downstream visits paths, not
 * objects, so that expansion is what they actually pay for.
 *
 * Checking both up front turns either into an ordinary validation failure. The
 * check itself uses an explicit stack and gives up at a fixed budget — a walker
 * that recursed, or that ran to completion, would be the very thing it is meant
 * to detect.
 */

/**
 * Maximum container nesting accepted in frontmatter. Matches the limit the YAML
 * parser already enforces, so a document handed in as an object is bounded the
 * same way as the identical document handed in as Markdown. Business documents
 * nest a handful of levels; anything near this is malformed or hostile.
 */
export const MAX_FRONTMATTER_DEPTH = 100;

/**
 * Maximum number of container positions visited while walking frontmatter.
 *
 * Depth alone does not bound the work: an alias chain eight levels deep that
 * widens by a factor of twelve at each step is well inside the depth limit and
 * still describes ~430 million positions. Counting positions bounds every
 * downstream walk — this guard, key normalisation, the validator — no matter
 * how the input is shaped.
 *
 * The largest realistic document (a few thousand table rows) uses low
 * thousands, so this leaves ample headroom while keeping the walk to
 * milliseconds.
 */
export const MAX_FRONTMATTER_NODES = 100_000;

/** Which limit a structure exceeded, and where the walk gave up. */
export interface StructureOverflow {
  kind: 'depth' | 'nodes';
  path: string;
}

export interface StructureLimits {
  maxDepth?: number;
  maxNodes?: number;
}

interface Frame {
  node: unknown;
  depth: number;
  path: string;
}

function isContainer(value: unknown): value is Record<string, unknown> | unknown[] {
  return typeof value === 'object' && value !== null;
}

/**
 * Return which limit the structure exceeds and the path where the walk stopped,
 * or `null` when it is within both.
 *
 * Depth counts containers: a top-level object is depth 1, a value inside it is
 * depth 2. Cyclic structures (possible via YAML anchors) simply keep getting
 * deeper and are reported as overflow rather than walked forever.
 *
 * The node budget is charged when a position is queued rather than when it is
 * visited, which keeps the pending stack bounded by the budget too.
 */
export function findStructureOverflow(
  value: unknown,
  limits: StructureLimits = {},
): StructureOverflow | null {
  const maxDepth = limits.maxDepth ?? MAX_FRONTMATTER_DEPTH;
  const maxNodes = limits.maxNodes ?? MAX_FRONTMATTER_NODES;
  if (!isContainer(value)) return null;

  let queued = 1;
  const stack: Frame[] = [{ node: value, depth: 1, path: '' }];
  while (stack.length > 0) {
    const frame = stack.pop() as Frame;
    if (frame.depth > maxDepth) return { kind: 'depth', path: frame.path };
    if (!isContainer(frame.node)) continue;

    if (Array.isArray(frame.node)) {
      for (let i = 0; i < frame.node.length; i += 1) {
        const child = frame.node[i];
        if (!isContainer(child)) continue;
        const path = `${frame.path}[${i}]`;
        queued += 1;
        if (queued > maxNodes) return { kind: 'nodes', path };
        stack.push({ node: child, depth: frame.depth + 1, path });
      }
      continue;
    }

    for (const [key, child] of Object.entries(frame.node)) {
      if (!isContainer(child)) continue;
      const path = frame.path ? `${frame.path}.${key}` : key;
      queued += 1;
      if (queued > maxNodes) return { kind: 'nodes', path };
      stack.push({ node: child, depth: frame.depth + 1, path });
    }
  }
  return null;
}

/**
 * Return the path of the first value past a structural limit, or `null` when
 * the whole structure is within them.
 *
 * Kept for callers that only need "is this safe to walk?"; use
 * `findStructureOverflow` when the answer has to say which limit was hit.
 */
export function findDepthOverflow(
  value: unknown,
  maxDepth: number = MAX_FRONTMATTER_DEPTH,
): string | null {
  return findStructureOverflow(value, { maxDepth })?.path ?? null;
}

/**
 * Depth check phrased as a validation failure, for the schema packages' parse
 * entry points.
 *
 * Both the key-normalisation pass and the compiled validator recurse over the
 * frontmatter, so an over-nested input would surface as a `RangeError` from
 * somewhere deep inside them rather than as a result the caller can render.
 * Markdown input is bounded already — the YAML parser refuses to compose past
 * this depth — but an object handed in directly never went through it.
 *
 * Returns `null` when the value is within the limit.
 */
export function depthValidationError(
  value: unknown,
  maxDepth: number = MAX_FRONTMATTER_DEPTH,
): ValidationError | null {
  const overflow = findStructureOverflow(value, { maxDepth });
  if (overflow === null) return null;
  const { kind, path } = overflow;
  return {
    // Match the JSON Pointer shape the schema validator reports, so callers can
    // treat this like any other validation error: `a.b[0].c` -> `/a/b/0/c`.
    path: `/${path.replace(/\[(\d+)\]/g, '.$1').split('.').join('/')}`,
    message:
      kind === 'depth'
        ? `Frontmatter is nested deeper than ${maxDepth} levels.`
        : `Frontmatter expands to more than ${MAX_FRONTMATTER_NODES} values. ` +
          'Repeated YAML aliases multiply the expanded size.',
    keyword: kind === 'depth' ? 'maxDepth' : 'maxNodes',
  };
}
