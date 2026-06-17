import {
  specSchema,
  normalizeSpecFrontmatter,
  autofillSpec,
  renderSpecFileName,
  translateSpecErrors,
  translateSpecWarnings,
  type Spec,
} from '@md-business/schema-spec';
import validateSpec from '@md-business/schema-spec/validate';
import { validateWithCompiled, renderMarkdownToHtml } from '@md-business/core';
import { renderSpecBody } from '@md-business/renderer-pdf';
import type { PreviewRenderResult, SchemaPlugin } from './types.js';

/**
 * Minimal structural defaults so `renderSpecBody` can paint a preview while
 * the author is still typing required fields. Mirrors the invoice plugin's
 * `withPreviewDefaults` philosophy: prefer a half-empty preview over a blank
 * one — authors get visual feedback while errors surface as a side channel.
 */
function withPreviewDefaults(data: Record<string, unknown>): Spec {
  const safe: Record<string, unknown> = { ...data };
  if (!safe['schemaVersion']) safe['schemaVersion'] = 'spec/v1';
  if (!safe['documentNumber']) safe['documentNumber'] = '';
  if (!safe['title']) safe['title'] = '';
  if (!safe['version']) safe['version'] = '0.1.0';
  if (!safe['issueDate']) safe['issueDate'] = '';
  if (!safe['status']) safe['status'] = 'draft';
  if (!Array.isArray(safe['authors']) || (safe['authors'] as unknown[]).length === 0) {
    safe['authors'] = [{ name: '' }];
  }
  return safe as unknown as Spec;
}

export const specPlugin: SchemaPlugin<Spec> = {
  id: 'spec',
  label: '基本設計書',
  schema: specSchema,
  stylesHref: 'styles/spec.css',
  detect(frontmatter) {
    // Spec-specific marker keys (English + Japanese aliases). Any one is
    // enough to route to this plugin when `schema:` / `schemaVersion:` are
    // absent — keeps the spec router consistent with the invoice plugin.
    const markers = ['documentNumber', '文書番号', 'chapters', '章ファイル', 'reviewers', 'レビュアー'];
    return markers.some((k) => k in frontmatter);
  },
  validate(frontmatter) {
    const normalized = normalizeSpecFrontmatter(frontmatter);
    const autofilled = autofillSpec(normalized.data);
    const warnings = translateSpecWarnings([
      ...normalized.warnings,
      ...autofilled.warnings,
    ]);
    const validation = validateWithCompiled<Spec>(autofilled.data, validateSpec);
    if (!validation.ok) {
      const translated = translateSpecErrors(validation.errors);
      return {
        ok: false,
        errors: validation.errors.map((e, i) => ({ ...e, message: translated[i] ?? e.message })),
        warnings,
      };
    }
    return { ok: true, data: validation.data, warnings };
  },
  render(frontmatter, markdownBody) {
    // Spec documents render the Markdown body as the chapter section beneath
    // the cover page. Body is converted via the core's CSP-safe MD→HTML
    // pipeline (unified — no eval / new Function()).
    const bodyHtml = markdownBody
      ? renderMarkdownToHtml(markdownBody, { hasFrontmatter: false })
      : '';
    return renderSpecBody(frontmatter, { bodyHtml });
  },
  previewRender(frontmatter, markdownBody): PreviewRenderResult {
    const normalized = normalizeSpecFrontmatter(frontmatter);
    const autofilled = autofillSpec(normalized.data);
    const warnings = translateSpecWarnings([
      ...normalized.warnings,
      ...autofilled.warnings,
    ]);
    const validation = validateWithCompiled<Spec>(autofilled.data, validateSpec);
    const errors = validation.ok
      ? []
      : validation.errors.map((e, i) => ({
          ...e,
          message: translateSpecErrors(validation.errors)[i] ?? e.message,
        }));
    const safe = withPreviewDefaults(autofilled.data);
    const bodyHtml = markdownBody
      ? renderMarkdownToHtml(markdownBody, { hasFrontmatter: false })
      : '';
    try {
      return { html: renderSpecBody(safe, { bodyHtml }), warnings, errors };
    } catch (renderErr: unknown) {
      const reason = renderErr instanceof Error ? renderErr.message : String(renderErr);
      return { html: '', warnings, errors, fatal: `プレビューを描画できませんでした: ${reason}` };
    }
  },
  documentTitle(frontmatter) {
    return frontmatter.title || `基本設計書 ${frontmatter.documentNumber}`;
  },
  pdfFileName(frontmatter) {
    return renderSpecFileName(frontmatter, frontmatter.fileName);
  },
};
