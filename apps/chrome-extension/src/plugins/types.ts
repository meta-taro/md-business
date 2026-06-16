import type { ValidationResult } from '@md-business/core';

/**
 * SchemaPlugin — extensibility point for future schemas (test-spec / design-doc / etc.).
 *
 * Each plugin owns:
 *   - id        : matches the `schema:` frontmatter field (e.g. "invoice").
 *   - label     : human-readable name shown in the popup selector.
 *   - schema    : JSON Schema reference (kept for tooling / future help UI).
 *   - validate  : precompiled validator (Ajv standalone codegen). MV3 CSP forbids
 *                 runtime `new Function()`, so each plugin ships its own
 *                 compiled-at-build-time validator.
 *   - render    : pure function that returns the body HTML fragment.
 *   - stylesHref: relative path (from extension root) to the document-specific CSS.
 *
 * Phase 1-MVP ships with only the invoice plugin; v1.1+ will register more.
 */
export interface SchemaPlugin<TFrontmatter = unknown> {
  readonly id: string;
  readonly label: string;
  readonly schema: object;
  readonly stylesHref: string;
  validate(frontmatter: unknown): ValidationResult<TFrontmatter>;
  /**
   * Optional heuristic detector used when neither `schema:` nor
   * `schemaVersion:` is present in the frontmatter. Lets a plugin claim a
   * document based on schema-specific marker keys (e.g. the invoice plugin
   * recognizes `請求書番号` / `品目` Japanese aliases) so authors writing
   * pure Japanese frontmatter still get auto-detected.
   */
  detect?(frontmatter: Record<string, unknown>): boolean;
  render(frontmatter: TFrontmatter): string;
  /** Override the <title> of the generated viewer page. */
  documentTitle?(frontmatter: TFrontmatter): string;
  /**
   * Compute the suggested PDF save filename. The viewer assigns this to
   * `document.title` right before `window.print()` so Chrome's "Save as PDF"
   * dialog pre-fills the user's preferred name, then restores the tab title.
   * Falls back to `documentTitle()` when not provided.
   */
  pdfFileName?(frontmatter: TFrontmatter): string;
}
