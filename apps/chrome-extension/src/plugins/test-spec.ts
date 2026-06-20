import {
  testSpecSchema,
  normalizeTestSpecFrontmatter,
  autofillTestSpec,
  renderTestSpecFileName,
  translateTestSpecErrors,
  translateTestSpecWarnings,
  type TestSpec,
} from '@md-business/schema-test-spec';
import validateTestSpec from '@md-business/schema-test-spec/validate';
import { validateWithCompiled, renderMarkdownToHtml } from '@md-business/core';
import { renderTestSpecBody } from '@md-business/renderer-pdf';
import { sanitizeViewerHtml } from '../shared/sanitizeHtml.js';
import type { PreviewRenderResult, SchemaPlugin } from './types.js';

/**
 * Inject the minimum structural defaults that keep `renderTestSpecBody` from
 * crashing on an in-progress draft. Same philosophy as the invoice / spec
 * plugins: the live editor pane should always show *something* while the
 * author is typing, with validation errors surfaced as a side channel.
 */
function withPreviewDefaults(data: Record<string, unknown>): TestSpec {
  const safe: Record<string, unknown> = { ...data };
  if (!safe['schema']) safe['schema'] = 'test-spec/v1';
  if (!safe['documentNumber']) safe['documentNumber'] = '';
  if (!safe['title']) safe['title'] = '';
  if (!safe['version']) safe['version'] = '0.1.0';
  if (!safe['issueDate']) safe['issueDate'] = '';
  if (!safe['status']) safe['status'] = 'draft';
  if (!Array.isArray(safe['authors']) || (safe['authors'] as unknown[]).length === 0) {
    safe['authors'] = [{ name: '' }];
  }
  if (!Array.isArray(safe['columns'])) safe['columns'] = [];
  return safe as unknown as TestSpec;
}

export const testSpecPlugin: SchemaPlugin<TestSpec> = {
  id: 'test-spec',
  label: '検証シート',
  schema: testSpecSchema,
  stylesHref: 'styles/test-spec.css',
  detect(frontmatter) {
    // Marker keys unique to test-spec frontmatter — both English and the
    // Japanese aliases that normalize would translate. `reviewers` / `レビュアー`
    // are intentionally NOT markers because spec uses them too. The test-spec
    // exclusive signal is the column-definition / Sheets-binding family.
    return (
      'columns' in frontmatter ||
      '列' in frontmatter ||
      '列定義' in frontmatter ||
      '検証項目列' in frontmatter ||
      'googleSheetId' in frontmatter ||
      'sheetId' in frontmatter ||
      'SheetId' in frontmatter ||
      'シートID' in frontmatter ||
      '連携シートID' in frontmatter
    );
  },
  validate(frontmatter) {
    const normalized = normalizeTestSpecFrontmatter(frontmatter);
    const autofilled = autofillTestSpec(normalized.data);
    const warnings = translateTestSpecWarnings([
      ...normalized.warnings,
      ...autofilled.warnings,
    ]);
    const validation = validateWithCompiled<TestSpec>(autofilled.data, validateTestSpec);
    if (!validation.ok) {
      const translated = translateTestSpecErrors(validation.errors);
      return {
        ok: false,
        errors: validation.errors.map((e, i) => ({ ...e, message: translated[i] ?? e.message })),
        warnings,
      };
    }
    return { ok: true, data: validation.data, warnings };
  },
  render(frontmatter, markdownBody) {
    const bodyHtml = markdownBody
      ? sanitizeViewerHtml(renderMarkdownToHtml(markdownBody, { hasFrontmatter: false }))
      : '';
    return renderTestSpecBody(frontmatter, { bodyHtml });
  },
  previewRender(frontmatter, markdownBody): PreviewRenderResult {
    const normalized = normalizeTestSpecFrontmatter(frontmatter);
    const autofilled = autofillTestSpec(normalized.data);
    const warnings = translateTestSpecWarnings([
      ...normalized.warnings,
      ...autofilled.warnings,
    ]);
    const validation = validateWithCompiled<TestSpec>(autofilled.data, validateTestSpec);
    const errors = validation.ok
      ? []
      : validation.errors.map((e, i) => ({
          ...e,
          message: translateTestSpecErrors(validation.errors)[i] ?? e.message,
        }));
    const safe = withPreviewDefaults(autofilled.data);
    const bodyHtml = markdownBody
      ? sanitizeViewerHtml(renderMarkdownToHtml(markdownBody, { hasFrontmatter: false }))
      : '';
    try {
      return { html: renderTestSpecBody(safe, { bodyHtml }), warnings, errors };
    } catch (renderErr: unknown) {
      const reason = renderErr instanceof Error ? renderErr.message : String(renderErr);
      return { html: '', warnings, errors, fatal: `プレビューを描画できませんでした: ${reason}` };
    }
  },
  documentTitle(frontmatter) {
    return frontmatter.title || `検証シート ${frontmatter.documentNumber}`;
  },
  pdfFileName(frontmatter) {
    return renderTestSpecFileName(frontmatter, frontmatter.fileName);
  },
};
