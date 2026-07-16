import {
  nosqlDbSpecSchema,
  normalizeNosqlDbSpecFrontmatter,
  autofillNosqlDbSpec,
  renderNosqlDbSpecFileName,
  translateNosqlDbSpecErrors,
  translateNosqlDbSpecWarnings,
  type NosqlDbSpec,
} from '@md-business/schema-nosql-db-spec';
import validateNosqlDbSpec from '@md-business/schema-nosql-db-spec/validate';
import { validateWithCompiled } from '@md-business/core';
import { renderNosqlDbSpecBody } from '@md-business/renderer-pdf';
import type { PreviewRenderResult, SchemaPlugin } from './types.js';

/**
 * Minimal structural defaults so `renderNosqlDbSpecBody` can paint a preview
 * while the author is still typing required fields. Mirrors the db-spec plugin's
 * `withPreviewDefaults` — a half-empty preview beats a blank one; validation
 * errors surface as a side channel.
 */
function withPreviewDefaults(data: Record<string, unknown>): NosqlDbSpec {
  const safe: Record<string, unknown> = { ...data };
  if (!safe['schema']) safe['schema'] = 'nosql-db-spec/v1';
  if (!safe['documentNumber']) safe['documentNumber'] = '';
  if (!safe['title']) safe['title'] = '';
  if (!safe['version']) safe['version'] = '0.1.0';
  if (!safe['issueDate']) safe['issueDate'] = '';
  if (!safe['status']) safe['status'] = 'draft';
  if (!safe['engine']) safe['engine'] = 'firestore';
  if (!Array.isArray(safe['authors']) || (safe['authors'] as unknown[]).length === 0) {
    safe['authors'] = [{ name: '' }];
  }
  if (!Array.isArray(safe['collections'])) {
    safe['collections'] = [];
  }
  return safe as unknown as NosqlDbSpec;
}

export const nosqlDbSpecPlugin: SchemaPlugin<NosqlDbSpec> = {
  id: 'nosql-db-spec',
  label: 'NoSQL 設計書',
  schema: nosqlDbSpecSchema,
  stylesHref: 'styles/nosql-db-spec.css',
  detect(frontmatter) {
    // `collections` / `コレクション` is the distinctive document-store marker. It
    // does not collide with db-spec (`tables` / `テーブル`) nor with spec, so a
    // pure-Japanese nosql-db-spec doc without a `schema:` field still auto-routes
    // here — but this plugin MUST be registered before `spec` (which also claims
    // `documentNumber` / `reviewers`) for that routing to win.
    const markers = ['collections', 'コレクション'];
    return markers.some((k) => k in frontmatter);
  },
  validate(frontmatter) {
    const normalized = normalizeNosqlDbSpecFrontmatter(frontmatter);
    const autofilled = autofillNosqlDbSpec(normalized.data);
    const warnings = translateNosqlDbSpecWarnings([
      ...normalized.warnings,
      ...autofilled.warnings,
    ]);
    const validation = validateWithCompiled<NosqlDbSpec>(autofilled.data, validateNosqlDbSpec);
    if (!validation.ok) {
      const translated = translateNosqlDbSpecErrors(validation.errors);
      return {
        ok: false,
        errors: validation.errors.map((e, i) => ({ ...e, message: translated[i] ?? e.message })),
        warnings,
      };
    }
    return { ok: true, data: validation.data, warnings };
  },
  render(frontmatter) {
    // nosql-db-spec is fully structured — no Markdown body. Every value is
    // escaped inside renderNosqlDbSpecBody, so there is no raw-HTML step.
    return renderNosqlDbSpecBody(frontmatter);
  },
  previewRender(frontmatter): PreviewRenderResult {
    const normalized = normalizeNosqlDbSpecFrontmatter(frontmatter);
    const autofilled = autofillNosqlDbSpec(normalized.data);
    const warnings = translateNosqlDbSpecWarnings([
      ...normalized.warnings,
      ...autofilled.warnings,
    ]);
    const validation = validateWithCompiled<NosqlDbSpec>(autofilled.data, validateNosqlDbSpec);
    const errors = validation.ok
      ? []
      : validation.errors.map((e, i) => ({
          ...e,
          message: translateNosqlDbSpecErrors(validation.errors)[i] ?? e.message,
        }));
    const safe = withPreviewDefaults(autofilled.data);
    try {
      return { html: renderNosqlDbSpecBody(safe), warnings, errors };
    } catch (renderErr: unknown) {
      const reason = renderErr instanceof Error ? renderErr.message : String(renderErr);
      return { html: '', warnings, errors, fatal: `プレビューを描画できませんでした: ${reason}` };
    }
  },
  documentTitle(frontmatter) {
    return frontmatter.title || `NoSQL 設計書 ${frontmatter.documentNumber}`;
  },
  pdfFileName(frontmatter) {
    return renderNosqlDbSpecFileName(frontmatter, frontmatter.fileName);
  },
};
