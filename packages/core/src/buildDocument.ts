import { serializeMarkdown } from './serialize.js';
import { validateWithCompiled, type CompiledValidator } from './validate.js';
import type { ValidationResult } from './types.js';

/**
 * Inputs for {@link buildDocument} — the pure core shared by the MCP
 * `create_document` / `update_document` tools (Issue 004 E章 P0) and the
 * desktop editor's "save frontmatter" flow.
 *
 * Deliberately descriptor-free: it does NOT detect a schema from the
 * frontmatter, nor inject a `schema:` key, nor resolve a validator from a
 * schema id. Those are registry concerns (which frontmatter key holds the
 * schema differs per document kind / language — `schemaVersion` vs `スキーマ`)
 * and belong to the calling execution layer. Keeping this brick registry-free
 * is what lets it ship without touching the chrome-extension / desktop
 * schema-detection registries (baseline §16). The caller passes an
 * already-assembled `frontmatter` and the already-resolved `validate`.
 */
export interface BuildDocumentInput {
  /** Complete frontmatter object, including whatever schema key the kind uses. */
  frontmatter: Record<string, unknown>;
  /** Markdown body that follows the frontmatter fence. */
  body: string;
  /**
   * Standalone-compiled validator for this document's schema, resolved by the
   * caller. Kept as an injected dependency so this module stays Ajv-free and
   * MV3-CSP-safe (see {@link validateWithCompiled}).
   */
  validate: CompiledValidator;
}

/**
 * Result of {@link buildDocument}: the canonical `.md` source plus the
 * validation verdict. `markdown` is produced regardless of validity so a
 * caller can preview a diff (or write to disk) even when validation fails —
 * the caller decides whether to persist based on `validation.ok`.
 */
export interface BuildDocumentResult<T = unknown> {
  markdown: string;
  validation: ValidationResult<T>;
}

/**
 * Assemble a Markdown document from structured frontmatter + body and validate
 * the frontmatter against an injected compiled schema validator.
 *
 * Pure composition of {@link serializeMarkdown} and
 * {@link validateWithCompiled}: no filesystem, no schema detection, no Ajv
 * runtime. `splitFrontmatter(buildDocument({ frontmatter, body, validate })
 * .markdown)` round-trips back to `{ frontmatter, body }`.
 */
export function buildDocument<T = unknown>(
  input: BuildDocumentInput,
): BuildDocumentResult<T> {
  const markdown = serializeMarkdown(input.frontmatter, input.body);
  const validation = validateWithCompiled<T>(input.frontmatter, input.validate);
  return { markdown, validation };
}
