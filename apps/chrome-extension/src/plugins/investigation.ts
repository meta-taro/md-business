import {
  investigationSchema,
  normalizeInvestigationFrontmatter,
  autofillInvestigation,
  renderInvestigationFileName,
  translateInvestigationErrors,
  translateInvestigationWarnings,
  type Investigation,
} from '@md-business/schema-investigation';
import validateInvestigation from '@md-business/schema-investigation/validate';
import {
  validateWithCompiled,
  renderMarkdownToHtml,
  findInternalBlocks,
  type DocumentEdition,
} from '@md-business/core';
import { renderInvestigationBody } from '@md-business/renderer-pdf';
import { sanitizeViewerHtml } from '../shared/sanitizeHtml.js';
import type { PreviewRenderResult, SchemaPlugin } from './types.js';

/**
 * Fill only the identity fields and array shells so a half-written report can
 * still be painted. `kind` stays empty on purpose: autofill does not decide it,
 * and guessing here would print an unverified fact on the report.
 */
function withPreviewDefaults(data: Record<string, unknown>): Investigation {
  const safe: Record<string, unknown> = { ...data };
  if (!safe['schema']) safe['schema'] = 'investigation/v1';
  if (!safe['kind']) safe['kind'] = '';
  if (!safe['documentNumber']) safe['documentNumber'] = '';
  if (!safe['title']) safe['title'] = '';
  if (!safe['createdAt']) safe['createdAt'] = '';
  if (!safe['status']) safe['status'] = 'investigating';
  if (!Array.isArray(safe['authors']) || (safe['authors'] as unknown[]).length === 0) {
    safe['authors'] = [{ name: '' }];
  }
  if (!Array.isArray(safe['targets'])) safe['targets'] = [];
  if (!Array.isArray(safe['tools'])) safe['tools'] = [];
  if (typeof safe['window'] !== 'object' || safe['window'] === null) {
    safe['window'] = { from: '', to: '' };
  }
  return safe as unknown as Investigation;
}

// The viewer has no folder to open evidence files from, so evidence paths are
// shown as code rather than links (renderInvestigationBody's default).
function bodyHtmlOf(markdownBody: string | undefined, edition: DocumentEdition): string {
  return markdownBody
    ? sanitizeViewerHtml(renderMarkdownToHtml(markdownBody, { hasFrontmatter: false, edition }))
    : '';
}

function translatedErrors(errors: ReturnType<typeof validateWithCompiled>): PreviewRenderResult['errors'] {
  if (errors.ok) return [];
  const translated = translateInvestigationErrors(errors.errors);
  return errors.errors.map((e, i) => ({ ...e, message: translated[i] ?? e.message }));
}

export const investigationPlugin: SchemaPlugin<Investigation> = {
  id: 'investigation',
  label: '調査報告書',
  schema: investigationSchema,
  stylesHref: 'styles/investigation.css',
  detect(frontmatter) {
    // findings / targets / tools are keys no other schema claims. Must be
    // registered before spec, which also claims 文書番号 / レビュアー.
    const markers = ['findings', '所見', 'targets', '対象ファイル', 'tools', '使用ツール'];
    return markers.some((k) => k in frontmatter);
  },
  validate(frontmatter) {
    const normalized = normalizeInvestigationFrontmatter(frontmatter);
    const autofilled = autofillInvestigation(normalized.data);
    const warnings = translateInvestigationWarnings([
      ...normalized.warnings,
      ...autofilled.warnings,
    ]);
    const validation = validateWithCompiled<Investigation>(autofilled.data, validateInvestigation);
    if (!validation.ok) {
      return { ok: false, errors: translatedErrors(validation), warnings };
    }
    return { ok: true, data: validation.data, warnings };
  },
  render(frontmatter, markdownBody, edition = 'internal') {
    return renderInvestigationBody(frontmatter, { bodyHtml: bodyHtmlOf(markdownBody, edition) });
  },
  previewRender(frontmatter, markdownBody, edition = 'internal'): PreviewRenderResult {
    const normalized = normalizeInvestigationFrontmatter(frontmatter);
    const autofilled = autofillInvestigation(normalized.data);
    const warnings = translateInvestigationWarnings([
      ...normalized.warnings,
      ...autofilled.warnings,
    ]);
    const validation = validateWithCompiled<Investigation>(autofilled.data, validateInvestigation);
    const errors = translatedErrors(validation);
    const safe = withPreviewDefaults(autofilled.data);
    try {
      return {
        html: renderInvestigationBody(safe, { bodyHtml: bodyHtmlOf(markdownBody, edition) }),
        warnings,
        errors,
      };
    } catch (renderErr: unknown) {
      const reason = renderErr instanceof Error ? renderErr.message : String(renderErr);
      return { html: '', warnings, errors, fatal: `プレビューを描画できませんでした: ${reason}` };
    }
  },
  documentTitle(frontmatter) {
    return frontmatter.title || `調査報告書 ${frontmatter.documentNumber}`;
  },
  pdfFileName(frontmatter) {
    return renderInvestigationFileName(frontmatter, frontmatter.fileName);
  },
  // 調査報告書は区分を持たないので、社内の囲みがあるときだけ版に差が出る。
  editionAware(_frontmatter, markdownBody) {
    return findInternalBlocks(markdownBody).length > 0;
  },
};
