import yaml from 'js-yaml';
import { FrontmatterError, classifyYamlReason } from './frontmatterError.js';
import { findYamlLimitBreach } from './yamlGuard.js';

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

// The expansion caps live next to the parser guard so the frontmatter and the
// project configuration file cannot drift apart. Re-exported because callers
// reach for them alongside the size cap above.
export { MAX_YAML_ANCHORS, MAX_YAML_ALIASES } from './yamlGuard.js';

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

  const breach = findYamlLimitBreach(yamlBlock, MAX_FRONTMATTER_CHARS, 'Frontmatter');
  if (breach) {
    throw new FrontmatterError(breach.kind, breach.message);
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
