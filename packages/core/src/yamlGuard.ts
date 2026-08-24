/**
 * Size and expansion limits shared by every YAML surface in this package.
 *
 * Both the document frontmatter and the project configuration file are read
 * with the same parser, so they carry the same risk: a small hostile file can
 * make the parser burn memory before any schema code gets a chance to reject
 * it. The limits live here so the two surfaces cannot drift apart — a guard
 * that is weaker on one of them is the same as having no guard.
 */

/**
 * Maximum number of YAML anchors in one block. Aliases expand during parsing,
 * and chained anchors (`&b [*a, *a]`) double the expanded size at every step, so
 * a few dozen lines can expand to gigabytes. Business documents rarely use
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

/** Which limit a block ran past. */
export type YamlLimitKind = 'too-large' | 'too-many-anchors' | 'too-many-aliases';

export interface YamlLimitBreach {
  kind: YamlLimitKind;
  /** Ready to show; names the limit and the value that passed it. */
  message: string;
}

function countMatches(source: string, pattern: RegExp): number {
  const matches = source.match(pattern);
  return matches ? matches.length : 0;
}

/**
 * Check a YAML block against the limits above, before handing it to the parser.
 *
 * Returns the first breach, or `null` when the block is within every limit.
 * Reporting rather than throwing lets each caller decide how the failure
 * surfaces — an exception for the document path, a collected problem for the
 * configuration path.
 *
 * @param source  the YAML text, without any surrounding delimiters
 * @param maxChars  size cap for this surface
 * @param label  what to call the block in the message (e.g. `Frontmatter`)
 */
export function findYamlLimitBreach(
  source: string,
  maxChars: number,
  label: string,
): YamlLimitBreach | null {
  if (source.length > maxChars) {
    return {
      kind: 'too-large',
      message: `${label} is too large (${source.length} characters, limit ${maxChars}).`,
    };
  }
  const anchors = countMatches(source, ANCHOR_RE);
  if (anchors > MAX_YAML_ANCHORS) {
    return {
      kind: 'too-many-anchors',
      message: `${label} declares too many YAML anchors (${anchors}, limit ${MAX_YAML_ANCHORS}).`,
    };
  }
  // Only meaningful once something has been anchored: an alias with no anchor
  // to bind to is a YAML error anyway, and `*` is common enough in prose
  // (Markdown emphasis inside a description) that counting it unconditionally
  // would reject ordinary documents.
  if (anchors > 0) {
    const aliases = countMatches(source, ALIAS_RE);
    if (aliases > MAX_YAML_ALIASES) {
      return {
        kind: 'too-many-aliases',
        message:
          `${label} uses too many YAML aliases (${aliases}, limit ${MAX_YAML_ALIASES}). ` +
          'Repeated aliases multiply the expanded size.',
      };
    }
  }
  return null;
}
