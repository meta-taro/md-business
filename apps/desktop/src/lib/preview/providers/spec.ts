/**
 * 基本設計書（spec）プレビュー provider。
 *
 * データ駆動 4 スキーマと違い prose 系: Markdown 本文（body）を表紙の下に
 * 章セクションとして描く。body は core の CSP 安全な MD→HTML パイプラインで
 * HTML 化してから sanitizeViewerHtml で inline `<svg>` / 画像 data URL を許し、
 * `<script>` / event handler / `javascript:` URL を落とす。
 *
 * ルーティング・default 補完・documentTitle は chrome-extension の specPlugin と
 * 揃える（正本 = apps/chrome-extension/src/plugins/spec.ts）。
 */
import {
  normalizeSpecFrontmatter,
  autofillSpec,
  translateSpecErrors,
  translateSpecWarnings,
  type Spec,
} from '@md-business/schema-spec';
import validateSpec from '@md-business/schema-spec/validate';
import { renderMarkdownToHtml } from '@md-business/core';
import { renderSpecBody } from '@md-business/renderer-pdf';
import specCss from '@md-business/renderer-pdf/styles/spec.css?raw';
import { createSchemaPreview } from '../previewFactory';
import { SPEC_META } from './meta';
import { sanitizeViewerHtml } from '../sanitizeHtml';

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

export const specProvider = createSchemaPreview<Spec>({
  meta: SPEC_META,
  normalize: normalizeSpecFrontmatter,
  autofill: autofillSpec,
  validate: validateSpec,
  translateErrors: translateSpecErrors,
  translateWarnings: translateSpecWarnings,
  withPreviewDefaults,
  documentTitle: (data) => data.title || `基本設計書 ${data.documentNumber ?? ''}`.trim(),
  // prose スキーマは Markdown 本文を HTML 化・sanitize して章セクションに描く。
  renderBody: (data, body) =>
    renderSpecBody(data, {
      bodyHtml: body
        ? sanitizeViewerHtml(renderMarkdownToHtml(body, { hasFrontmatter: false }))
        : '',
    }),
  css: specCss,
});
