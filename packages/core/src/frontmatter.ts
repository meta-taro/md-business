import yaml from 'js-yaml';
import { FrontmatterError, classifyYamlReason } from './frontmatterError.js';

/** A js-yaml exception carries the failure reason and its position separately. */
interface YamlExceptionLike {
  reason?: string;
  mark?: { line?: number; column?: number };
}

function isYamlException(error: unknown): error is Error & YamlExceptionLike {
  return error instanceof Error && typeof (error as YamlExceptionLike).reason === 'string';
}

export interface FrontmatterSplit {
  data: Record<string, unknown>;
  body: string;
}

const DELIM = '---';

/**
 * Maximum size of the YAML block. Frontmatter is a document header; a block
 * larger than this is not something a person typed, and parsing it costs memory
 * before any schema gets to reject it.
 */
export const MAX_FRONTMATTER_CHARS = 256_000;

/**
 * Maximum number of YAML anchors in one block. Aliases expand during parsing,
 * and chained anchors (`&b [*a, *a]`) double the expanded size at every step, so
 * a few dozen lines can expand to gigabytes. Business frontmatter rarely uses
 * anchors at all; a small cap keeps the expansion bounded while leaving room for
 * legitimate "define once, reuse" blocks.
 */
export const MAX_YAML_ANCHORS = 8;

/**
 * Maximum number of alias references (`*name`) in one block.
 *
 * The anchor cap alone does not bound the expansion: what multiplies the
 * expanded size is how often each anchor is *referenced*, and a chain can stay
 * inside the anchor cap while widening by an arbitrary factor at every step.
 * Eight anchors referenced twelve times each is under 600 bytes and expands to
 * hundreds of millions of positions.
 *
 * Spreading this many references across the anchor cap tops out at
 * `(32 / 8) ** 8` ≈ 65k positions, which stays inside the node budget the
 * parsed structure is checked against downstream. Documents that reuse a
 * "define once" block use a handful.
 */
export const MAX_YAML_ALIASES = 32;

/**
 * Anchor definitions (`&name`) as they appear in YAML: at the start of a value,
 * so preceded by whitespace or a flow opener and followed by the anchor name.
 * `A & B` in prose has a space after the ampersand and does not match.
 */
const ANCHOR_RE = /(?:^|[\s,[{])&[^\s,\]}]+/g;

/** Alias references (`*name`), in the same positions an anchor can appear. */
const ALIAS_RE = /(?:^|[\s,[{])\*[^\s,\]}]+/g;

function countMatches(yamlBlock: string, pattern: RegExp): number {
  const matches = yamlBlock.match(pattern);
  return matches ? matches.length : 0;
}

/**
 * Split a Markdown source into YAML frontmatter + body.
 *
 * Replaces gray-matter for CSP safety (gray-matter ships a `javascript` engine
 * that calls `eval()`, which Chrome MV3 rejects under `script-src 'self'`).
 *
 * Supports:
 *   - LF and CRLF line endings
 *   - Leading BOM
 *   - Optional UTF-8 BOM stripping
 *   - Absent frontmatter (returns `{ data: {}, body: src }`)
 *
 * Throws on malformed YAML so the caller surfaces a useful error.
 */
export function splitFrontmatter(src: string): FrontmatterSplit {
  let input = src;
  if (input.charCodeAt(0) === 0xfeff) input = input.slice(1);

  // Frontmatter must start with the delimiter on the very first line.
  if (!input.startsWith(DELIM)) {
    return { data: {}, body: input };
  }
  const afterOpen = input.slice(DELIM.length);
  // Require a line break immediately after the opening delimiter; bare `---x`
  // is just text content, not a frontmatter block.
  if (!/^\r?\n/.test(afterOpen)) {
    return { data: {}, body: input };
  }

  // Locate the closing delimiter on its own line. Be tolerant of CRLF and of
  // an optional trailing newline after the closing delimiter.
  const closingRe = /\r?\n---[ \t]*(\r?\n|$)/;
  const closingMatch = closingRe.exec(afterOpen);
  if (!closingMatch) {
    return { data: {}, body: input };
  }

  const yamlBlock = afterOpen.slice(0, closingMatch.index);
  const body = afterOpen.slice(closingMatch.index + closingMatch[0].length);

  if (yamlBlock.length > MAX_FRONTMATTER_CHARS) {
    throw new FrontmatterError(
      'too-large',
      `Frontmatter is too large (${yamlBlock.length} characters, limit ${MAX_FRONTMATTER_CHARS}).`,
    );
  }
  const anchors = countMatches(yamlBlock, ANCHOR_RE);
  if (anchors > MAX_YAML_ANCHORS) {
    throw new FrontmatterError(
      'too-many-anchors',
      `Frontmatter declares too many YAML anchors (${anchors}, limit ${MAX_YAML_ANCHORS}).`,
    );
  }
  // Only meaningful once something has been anchored: an alias with no anchor
  // to bind to is a YAML error anyway, and `*` is common enough in prose
  // (Markdown emphasis inside a description) that counting it unconditionally
  // would reject ordinary documents.
  if (anchors > 0) {
    const aliases = countMatches(yamlBlock, ALIAS_RE);
    if (aliases > MAX_YAML_ALIASES) {
      throw new FrontmatterError(
        'too-many-aliases',
        `Frontmatter uses too many YAML aliases (${aliases}, limit ${MAX_YAML_ALIASES}). ` +
          'Repeated aliases multiply the expanded size.',
      );
    }
  }

  // Nesting depth needs no guard here: js-yaml refuses to compose past 100
  // levels and reports it as an ordinary YAML error, so neither block nor flow
  // collections can overflow the composer. Callers that hand in an already
  // parsed object instead of Markdown skip that check — `findDepthOverflow`
  // covers them.
  let parsed: unknown;
  try {
    parsed = yaml.load(yamlBlock, { schema: yaml.JSON_SCHEMA });
  } catch (error: unknown) {
    if (!isYamlException(error)) throw error;
    const reason = error.reason ?? error.message;
    // The parser counts lines from the start of the block it was handed, which
    // begins at the line break that ends the opening `---`. So its line 0 is
    // the file's line 1, and a 1-based file line is simply `mark.line + 1`.
    throw new FrontmatterError(classifyYamlReason(reason), reason, {
      line: typeof error.mark?.line === 'number' ? error.mark.line + 1 : null,
      column: typeof error.mark?.column === 'number' ? error.mark.column + 1 : null,
    });
  }
  const data =
    parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  return { data, body };
}
