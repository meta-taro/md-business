import yaml from 'js-yaml';

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
 * Anchor definitions (`&name`) as they appear in YAML: at the start of a value,
 * so preceded by whitespace or a flow opener and followed by the anchor name.
 * `A & B` in prose has a space after the ampersand and does not match.
 */
const ANCHOR_RE = /(?:^|[\s,[{])&[^\s,\]}]+/g;

function countAnchors(yamlBlock: string): number {
  const matches = yamlBlock.match(ANCHOR_RE);
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
    throw new Error(
      `Frontmatter is too large (${yamlBlock.length} characters, limit ${MAX_FRONTMATTER_CHARS}).`,
    );
  }
  const anchors = countAnchors(yamlBlock);
  if (anchors > MAX_YAML_ANCHORS) {
    throw new Error(
      `Frontmatter declares too many YAML anchors (${anchors}, limit ${MAX_YAML_ANCHORS}).`,
    );
  }

  // Nesting depth needs no guard here: js-yaml refuses to compose past 100
  // levels and reports it as an ordinary YAML error, so neither block nor flow
  // collections can overflow the composer. Callers that hand in an already
  // parsed object instead of Markdown skip that check — `findDepthOverflow`
  // covers them.
  const parsed = yaml.load(yamlBlock, { schema: yaml.JSON_SCHEMA });
  const data =
    parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  return { data, body };
}
