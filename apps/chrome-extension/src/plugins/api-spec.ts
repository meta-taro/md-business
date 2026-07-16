import {
  apiSpecSchema,
  normalizeApiSpecFrontmatter,
  autofillApiSpec,
  renderApiSpecFileName,
  translateApiSpecErrors,
  translateApiSpecWarnings,
  type ApiSpec,
} from '@md-business/schema-api-spec';
import validateApiSpec from '@md-business/schema-api-spec/validate';
import { validateWithCompiled } from '@md-business/core';
import { renderApiSpecBody } from '@md-business/renderer-pdf';
import type { PreviewRenderResult, SchemaPlugin } from './types.js';

/**
 * Minimal structural defaults so `renderApiSpecBody` can paint a preview while
 * the author is still typing required fields. A half-empty preview beats a blank
 * one; validation errors surface as a side channel.
 *
 * This only fills the render-required fields that {@link autofillApiSpec} does
 * NOT already guarantee. `previewRender` always runs autofill first, so
 * schema / version / status / protocol / auth are settled by the time we get
 * here — re-setting them would be dead code. What autofill leaves absent are the
 * required-but-undefaultable identity fields (documentNumber / title / issueDate)
 * and the array shells the renderer maps over (authors / endpoints).
 */
function withPreviewDefaults(data: Record<string, unknown>): ApiSpec {
  const safe: Record<string, unknown> = { ...data };
  if (!safe['documentNumber']) safe['documentNumber'] = '';
  if (!safe['title']) safe['title'] = '';
  if (!safe['issueDate']) safe['issueDate'] = '';
  if (!Array.isArray(safe['authors']) || (safe['authors'] as unknown[]).length === 0) {
    safe['authors'] = [{ name: '' }];
  }
  if (!Array.isArray(safe['endpoints'])) {
    safe['endpoints'] = [];
  }
  return safe as unknown as ApiSpec;
}

export const apiSpecPlugin: SchemaPlugin<ApiSpec> = {
  id: 'api-spec',
  label: 'API 設計書',
  schema: apiSpecSchema,
  stylesHref: 'styles/api-spec.css',
  detect(frontmatter) {
    // `endpoints` / `エンドポイント` is the distinctive API-doc marker. It does not
    // collide with db-spec (`tables` / `テーブル`) nor nosql-db-spec (`collections` /
    // `コレクション`) nor spec, so a pure-Japanese api-spec doc without a `schema:`
    // field still auto-routes here — but this plugin MUST be registered before
    // `spec` (which also claims `documentNumber` / `reviewers`) for that to win.
    const markers = ['endpoints', 'エンドポイント'];
    return markers.some((k) => k in frontmatter);
  },
  validate(frontmatter) {
    const normalized = normalizeApiSpecFrontmatter(frontmatter);
    const autofilled = autofillApiSpec(normalized.data);
    const warnings = translateApiSpecWarnings([
      ...normalized.warnings,
      ...autofilled.warnings,
    ]);
    const validation = validateWithCompiled<ApiSpec>(autofilled.data, validateApiSpec);
    if (!validation.ok) {
      const translated = translateApiSpecErrors(validation.errors);
      return {
        ok: false,
        errors: validation.errors.map((e, i) => ({ ...e, message: translated[i] ?? e.message })),
        warnings,
      };
    }
    return { ok: true, data: validation.data, warnings };
  },
  render(frontmatter) {
    // api-spec is fully structured — no Markdown body. Every value is escaped
    // inside renderApiSpecBody, so there is no raw-HTML step.
    return renderApiSpecBody(frontmatter);
  },
  previewRender(frontmatter): PreviewRenderResult {
    const normalized = normalizeApiSpecFrontmatter(frontmatter);
    const autofilled = autofillApiSpec(normalized.data);
    const warnings = translateApiSpecWarnings([
      ...normalized.warnings,
      ...autofilled.warnings,
    ]);
    const validation = validateWithCompiled<ApiSpec>(autofilled.data, validateApiSpec);
    const errors = validation.ok
      ? []
      : validation.errors.map((e, i) => ({
          ...e,
          message: translateApiSpecErrors(validation.errors)[i] ?? e.message,
        }));
    const safe = withPreviewDefaults(autofilled.data);
    try {
      return { html: renderApiSpecBody(safe), warnings, errors };
    } catch (renderErr: unknown) {
      const reason = renderErr instanceof Error ? renderErr.message : String(renderErr);
      return { html: '', warnings, errors, fatal: `プレビューを描画できませんでした: ${reason}` };
    }
  },
  documentTitle(frontmatter) {
    return frontmatter.title || `API 設計書 ${frontmatter.documentNumber}`;
  },
  pdfFileName(frontmatter) {
    return renderApiSpecFileName(frontmatter, frontmatter.fileName);
  },
};
