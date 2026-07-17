/**
 * 検証シート（test-spec）プレビュー provider。
 *
 * spec と同じ prose 系: Markdown 本文（body）を HTML 化・sanitize して描く。
 * ルーティング・default 補完・documentTitle は chrome-extension の testSpecPlugin と
 * 揃える（正本 = apps/chrome-extension/src/plugins/test-spec.ts）。
 *
 * detect マーカーは列定義 / Sheets 連携系に限定する。`reviewers` は spec も使うため
 * マーカーにしない（test-spec 排他シグナルは columns / 列 / googleSheetId 系）。
 */
import {
  normalizeTestSpecFrontmatter,
  autofillTestSpec,
  translateTestSpecErrors,
  translateTestSpecWarnings,
  type TestSpec,
} from '@md-business/schema-test-spec';
import validateTestSpec from '@md-business/schema-test-spec/validate';
import { renderMarkdownToHtml } from '@md-business/core';
import { renderTestSpecBody } from '@md-business/renderer-pdf';
import testSpecCss from '@md-business/renderer-pdf/styles/test-spec.css?raw';
import { createSchemaPreview } from '../previewFactory';
import { sanitizeViewerHtml } from '../sanitizeHtml';

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

export const testSpecProvider = createSchemaPreview<TestSpec>({
  meta: {
    id: 'test-spec',
    label: '検証シート',
    markers: [
      'columns',
      '列',
      '列定義',
      '検証項目列',
      'googleSheetId',
      'sheetId',
      'SheetId',
      'シートID',
      '連携シートID',
    ],
  },
  normalize: normalizeTestSpecFrontmatter,
  autofill: autofillTestSpec,
  validate: validateTestSpec,
  translateErrors: translateTestSpecErrors,
  translateWarnings: translateTestSpecWarnings,
  withPreviewDefaults,
  documentTitle: (data) => data.title || `検証シート ${data.documentNumber ?? ''}`.trim(),
  // prose スキーマは Markdown 本文を HTML 化・sanitize して描く。
  renderBody: (data, body) =>
    renderTestSpecBody(data, {
      bodyHtml: body
        ? sanitizeViewerHtml(renderMarkdownToHtml(body, { hasFrontmatter: false }))
        : '',
    }),
  css: testSpecCss,
});
