import yaml from 'js-yaml';

export interface FrontmatterSplit {
  data: Record<string, unknown>;
  body: string;
}

const DELIM = '---';

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

  const parsed = yaml.load(yamlBlock, { schema: yaml.JSON_SCHEMA });
  const data =
    parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  return { data, body };
}
