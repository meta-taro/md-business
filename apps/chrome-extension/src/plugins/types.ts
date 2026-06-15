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
  render(frontmatter: TFrontmatter): string;
  /** Override the <title> of the generated viewer page. */
  documentTitle?(frontmatter: TFrontmatter): string;
}
