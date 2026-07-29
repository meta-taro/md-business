import type { ValidationError } from './types.js';

/**
 * Nesting-depth guard for parsed frontmatter.
 *
 * Several schemas describe recursive shapes (an array field whose element type
 * is itself a field definition), so a small `.md` file can declare thousands of
 * nesting levels. Both the key-normalisation pass and the compiled validator
 * walk that structure recursively, and either would exhaust the call stack
 * before reporting anything useful.
 *
 * Checking the depth up front turns that into an ordinary validation failure.
 * The check itself uses an explicit stack — a recursive walker would hit the
 * very limit it is meant to detect.
 */

/**
 * Maximum container nesting accepted in frontmatter. Matches the limit the YAML
 * parser already enforces, so a document handed in as an object is bounded the
 * same way as the identical document handed in as Markdown. Business documents
 * nest a handful of levels; anything near this is malformed or hostile.
 */
export const MAX_FRONTMATTER_DEPTH = 100;

interface Frame {
  node: unknown;
  depth: number;
  path: string;
}

function isContainer(value: unknown): value is Record<string, unknown> | unknown[] {
  return typeof value === 'object' && value !== null;
}

/**
 * Return the path of the first value nested deeper than `maxDepth`, or `null`
 * when the whole structure is within the limit.
 *
 * Depth counts containers: a top-level object is depth 1, a value inside it is
 * depth 2. Cyclic structures (possible via YAML anchors) simply keep getting
 * deeper and are reported as overflow rather than walked forever.
 */
export function findDepthOverflow(
  value: unknown,
  maxDepth: number = MAX_FRONTMATTER_DEPTH,
): string | null {
  if (!isContainer(value)) return null;

  const stack: Frame[] = [{ node: value, depth: 1, path: '' }];
  while (stack.length > 0) {
    const frame = stack.pop() as Frame;
    if (frame.depth > maxDepth) return frame.path;
    if (!isContainer(frame.node)) continue;

    if (Array.isArray(frame.node)) {
      for (let i = 0; i < frame.node.length; i += 1) {
        const child = frame.node[i];
        if (!isContainer(child)) continue;
        stack.push({ node: child, depth: frame.depth + 1, path: `${frame.path}[${i}]` });
      }
      continue;
    }

    for (const [key, child] of Object.entries(frame.node)) {
      if (!isContainer(child)) continue;
      const path = frame.path ? `${frame.path}.${key}` : key;
      stack.push({ node: child, depth: frame.depth + 1, path });
    }
  }
  return null;
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
  const path = findDepthOverflow(value, maxDepth);
  if (path === null) return null;
  return {
    // Match the JSON Pointer shape the schema validator reports, so callers can
    // treat this like any other validation error: `a.b[0].c` -> `/a/b/0/c`.
    path: `/${path.replace(/\[(\d+)\]/g, '.$1').split('.').join('/')}`,
    message: `Frontmatter is nested deeper than ${maxDepth} levels.`,
    keyword: 'maxDepth',
  };
}
