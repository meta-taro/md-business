import {
  dbSpecSchema,
  normalizeDbSpecFrontmatter,
  autofillDbSpec,
  renderDbSpecFileName,
  translateDbSpecErrors,
  translateDbSpecWarnings,
  type DbSpec,
} from '@md-business/schema-db-spec';
import validateDbSpec from '@md-business/schema-db-spec/validate';
import { validateWithCompiled } from '@md-business/core';
import { renderDbSpecBody } from '@md-business/renderer-pdf';
import type { PreviewRenderResult, SchemaPlugin } from './types.js';

/**
 * Minimal structural defaults so `renderDbSpecBody` can paint a preview while
 * the author is still typing required fields. Mirrors the spec / invoice
 * plugins' `withPreviewDefaults` philosophy — a half-empty preview beats a
 * blank one; validation errors surface as a side channel.
 */
function withPreviewDefaults(data: Record<string, unknown>): DbSpec {
  const safe: Record<string, unknown> = { ...data };
  if (!safe['schema']) safe['schema'] = 'db-spec/v1';
  if (!safe['documentNumber']) safe['documentNumber'] = '';
  if (!safe['title']) safe['title'] = '';
  if (!safe['version']) safe['version'] = '0.1.0';
  if (!safe['issueDate']) safe['issueDate'] = '';
  if (!safe['status']) safe['status'] = 'draft';
  if (!safe['engine']) safe['engine'] = 'postgres';
  if (!Array.isArray(safe['authors']) || (safe['authors'] as unknown[]).length === 0) {
    safe['authors'] = [{ name: '' }];
  }
  if (!Array.isArray(safe['tables'])) {
    safe['tables'] = [];
  }
  return safe as unknown as DbSpec;
}

export const dbSpecPlugin: SchemaPlugin<DbSpec> = {
  id: 'db-spec',
  label: 'DB 設計書',
  schema: dbSpecSchema,
  stylesHref: 'styles/db-spec.css',
  detect(frontmatter) {
    // `tables` / `テーブル` is the distinctive RDB marker. It does not collide
    // with nosql-db-spec (`collections` / `コレクション`) nor with spec, so a
    // pure-Japanese db-spec doc without a `schema:` field still auto-routes
    // here — but this plugin MUST be registered before `spec` (which also
    // claims `documentNumber` / `reviewers`) for that routing to win.
    const markers = ['tables', 'テーブル'];
    return markers.some((k) => k in frontmatter);
  },
  validate(frontmatter) {
    const normalized = normalizeDbSpecFrontmatter(frontmatter);
    const autofilled = autofillDbSpec(normalized.data);
    const warnings = translateDbSpecWarnings([...normalized.warnings, ...autofilled.warnings]);
    const validation = validateWithCompiled<DbSpec>(autofilled.data, validateDbSpec);
    if (!validation.ok) {
      const translated = translateDbSpecErrors(validation.errors);
      return {
        ok: false,
        errors: validation.errors.map((e, i) => ({ ...e, message: translated[i] ?? e.message })),
        warnings,
      };
    }
    return { ok: true, data: validation.data, warnings };
  },
  render(frontmatter) {
    // db-spec is fully structured — no Markdown body. Every value is escaped
    // inside renderDbSpecBody, so there is no raw-HTML sanitization step.
    return renderDbSpecBody(frontmatter);
  },
  previewRender(frontmatter): PreviewRenderResult {
    const normalized = normalizeDbSpecFrontmatter(frontmatter);
    const autofilled = autofillDbSpec(normalized.data);
    const warnings = translateDbSpecWarnings([...normalized.warnings, ...autofilled.warnings]);
    const validation = validateWithCompiled<DbSpec>(autofilled.data, validateDbSpec);
    const errors = validation.ok
      ? []
      : validation.errors.map((e, i) => ({
          ...e,
          message: translateDbSpecErrors(validation.errors)[i] ?? e.message,
        }));
    const safe = withPreviewDefaults(autofilled.data);
    try {
      return { html: renderDbSpecBody(safe), warnings, errors };
    } catch (renderErr: unknown) {
      const reason = renderErr instanceof Error ? renderErr.message : String(renderErr);
      return { html: '', warnings, errors, fatal: `プレビューを描画できませんでした: ${reason}` };
    }
  },
  documentTitle(frontmatter) {
    return frontmatter.title || `DB 設計書 ${frontmatter.documentNumber}`;
  },
  pdfFileName(frontmatter) {
    return renderDbSpecFileName(frontmatter, frontmatter.fileName);
  },
};
