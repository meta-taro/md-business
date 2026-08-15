/**
 * 調査報告書（investigation）プレビュー provider。
 *
 * prose 系: 経緯・調べ方・結論は Markdown 本文にしか無いので、frontmatter の
 * 事実（対象ファイル・道具・所見）を描いた後ろに本文を続ける。本文は core の
 * CSP 安全な MD→HTML パイプラインで HTML 化してから sanitizeViewerHtml に通す。
 */
import {
  normalizeInvestigationFrontmatter,
  autofillInvestigation,
  translateInvestigationErrors,
  translateInvestigationWarnings,
  type Investigation,
} from '@md-business/schema-investigation';
import validateInvestigation from '@md-business/schema-investigation/validate';
import { renderMarkdownToHtml } from '@md-business/core';
import { renderInvestigationBody } from '@md-business/renderer-pdf';
import investigationCss from '@md-business/renderer-pdf/styles/investigation.css?raw';
import { createSchemaPreview } from '../previewFactory';
import { sanitizeViewerHtml } from '../sanitizeHtml';

/**
 * 書きかけでも描けるよう、identity と配列の器だけを空で補う。
 *
 * `kind`（何を調べたか）は空のままにする。autofill が埋めない値をここで
 * 決め打つと、確かめていない事実が報告書に載る。
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

export const investigationProvider = createSchemaPreview<Investigation>({
  meta: {
    id: 'investigation',
    label: '調査報告書',
    // 所見 / 対象ファイル / 使用ツールは他スキーマが主張しないキー。spec の広い
    // マーカー（文書番号 / レビュアー）に取られないよう spec より前に登録する。
    markers: ['findings', '所見', 'targets', '対象ファイル', 'tools', '使用ツール'],
  },
  normalize: normalizeInvestigationFrontmatter,
  autofill: autofillInvestigation,
  validate: validateInvestigation,
  translateErrors: translateInvestigationErrors,
  translateWarnings: translateInvestigationWarnings,
  withPreviewDefaults,
  documentTitle: (data) => data.title || `調査報告書 ${data.documentNumber ?? ''}`.trim(),
  renderBody: (data, body) =>
    renderInvestigationBody(data, {
      bodyHtml: body
        ? sanitizeViewerHtml(renderMarkdownToHtml(body, { hasFrontmatter: false }))
        : '',
      // デスクトップは根拠ファイルを開く先を持っている（プレビューのリンクを
      // 親側で受けて、同じフォルダの文書として開く）。
      linkEvidence: true,
    }),
  css: investigationCss,
});
