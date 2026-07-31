/**
 * Frontmatter parse failures, classified.
 *
 * The YAML parser reports problems in English, phrased for someone debugging a
 * parser ("bad indentation of a mapping entry"), and counts lines from the
 * start of its own block rather than the start of the file. Both are useless to
 * the person who typed the document.
 *
 * This module keeps the classification here — where the parser lives — and
 * leaves the wording to the caller: each app turns a `kind` into a sentence in
 * the reader's language. No user-facing text is defined in this package.
 */

/** What went wrong, as a stable identifier callers can switch on. */
export type FrontmatterProblemKind =
  /** A key is indented deeper than the block it belongs to. */
  | 'indentation'
  /** Tab characters used for indentation (YAML allows spaces only). */
  | 'tab'
  /** The same key appears twice in one block. */
  | 'duplicate-key'
  /** A quote or bracket is never closed. */
  | 'unterminated'
  /** A line is not a `key: value` pair. */
  | 'block-mapping'
  /** The block is larger than the parser will accept. */
  | 'too-large'
  /** Too many YAML anchors declared. */
  | 'too-many-anchors'
  /** Too many alias references for the declared anchors. */
  | 'too-many-aliases'
  /** Anything the parser reported that is not one of the above. */
  | 'unknown';

/** A classified failure, with the position expressed in file coordinates. */
export interface FrontmatterProblem {
  kind: FrontmatterProblemKind;
  /** 1-based line in the whole file, or null when the parser gave no position. */
  line: number | null;
  /** 1-based column, or null. */
  column: number | null;
  /** The original message, kept verbatim for diagnostics. */
  raw: string;
}

/** Thrown by `splitFrontmatter` so callers get a `kind` instead of a sentence. */
export class FrontmatterError extends Error {
  readonly kind: FrontmatterProblemKind;
  readonly line: number | null;
  readonly column: number | null;

  constructor(
    kind: FrontmatterProblemKind,
    message: string,
    position: { line?: number | null; column?: number | null } = {},
  ) {
    super(message);
    this.name = 'FrontmatterError';
    this.kind = kind;
    this.line = position.line ?? null;
    this.column = position.column ?? null;
  }
}

/**
 * Map a js-yaml `reason` to a kind. Matching is on substrings because the
 * library composes some reasons with extra clauses (`"...; a multiline key may
 * not be an implicit key"`).
 */
export function classifyYamlReason(reason: string): FrontmatterProblemKind {
  if (reason.includes('bad indentation')) return 'indentation';
  if (reason.includes('tab characters')) return 'tab';
  if (reason.includes('duplicated mapping key')) return 'duplicate-key';
  if (reason.includes('unexpected end of the stream')) return 'unterminated';
  if (reason.includes('unexpected end of the document')) return 'unterminated';
  if (reason.includes('block mapping entry')) return 'block-mapping';
  if (reason.includes('mapping values are not allowed')) return 'block-mapping';
  return 'unknown';
}

/**
 * Read a thrown value as a `FrontmatterProblem`. Values that did not come from
 * `splitFrontmatter` fall back to `unknown` with the text preserved, so a
 * caller can always render something rather than swallowing the failure.
 */
export function describeFrontmatterError(error: unknown): FrontmatterProblem {
  if (error instanceof FrontmatterError) {
    return { kind: error.kind, line: error.line, column: error.column, raw: error.message };
  }
  const raw = error instanceof Error ? error.message : String(error);
  return { kind: 'unknown', line: null, column: null, raw };
}
