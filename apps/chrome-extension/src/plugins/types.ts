import type { ValidationError, ValidationResult } from '@md-business/core';

/**
 * Result of a permissive preview render — used by the live editor so that the
 * user can see something useful while typing, even before the document is
 * fully valid. Errors and warnings are surfaced as side channels rather than
 * blocking the render.
 */
export interface PreviewRenderResult {
  /** Rendered HTML fragment (best-effort). Empty string if the renderer threw. */
  html: string;
  /** Non-fatal warnings already translated to user-facing Japanese. */
  warnings: string[];
  /**
   * Validation errors collected from the strict pass — surfaced to the editor
   * UI so the user can see what is still missing, without preventing the
   * preview from rendering.
   */
  errors: ValidationError[];
  /** Last-resort fatal error message when the renderer itself threw. */
  fatal?: string;
}

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
  /**
   * Render the body HTML for a fully validated document. The optional
   * `markdownBody` parameter carries the Markdown body text (post-frontmatter)
   * for schemas whose output includes prose — design docs, test specs, etc.
   * Data-driven schemas (invoice) ignore it.
   */
  render(frontmatter: TFrontmatter, markdownBody?: string): string;
  /**
   * Permissive render used by the live editor preview pane. Unlike `validate()`
   * + `render()`, this path never throws and never blocks — it returns the
   * best-effort HTML even if required fields are missing, and surfaces the
   * validation errors as a side channel. The viewer can show them as a
   * non-blocking warning list while still keeping the preview pane filled.
   * `markdownBody` is the post-frontmatter body text; ignored by data-driven
   * schemas.
   */
  previewRender?(frontmatter: unknown, markdownBody?: string): PreviewRenderResult;
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
