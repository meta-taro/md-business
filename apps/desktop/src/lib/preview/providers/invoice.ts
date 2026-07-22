/**
 * 適格請求書プレビュー provider。
 *
 * 他の設計書スキーマと違い identity キーは `schemaVersion`（invoice/v1）で、
 * documentTitle も請求書番号ベース。autofillInvoice が taxSummary / totals を
 * 常に出すため、それらの default 補完は不要。
 */
import {
  normalizeInvoiceFrontmatter,
  autofillInvoice,
  translateInvoiceErrors,
  translateInvoiceWarnings,
  type Invoice,
} from '@md-business/schema-invoice';
import validateInvoice from '@md-business/schema-invoice/validate';
import { renderInvoiceBody } from '@md-business/renderer-pdf';
import invoiceCss from '@md-business/renderer-pdf/styles/invoice.css?raw';
import { createSchemaPreview } from '../previewFactory';

function withPreviewDefaults(data: Record<string, unknown>): Invoice {
  const safe: Record<string, unknown> = { ...data };
  if (!safe['schemaVersion']) safe['schemaVersion'] = 'invoice/v1';
  if (!safe['invoiceNumber']) safe['invoiceNumber'] = '';
  if (!safe['issueDate']) safe['issueDate'] = '';
  if (typeof safe['issuer'] !== 'object' || safe['issuer'] === null) {
    safe['issuer'] = { name: '' };
  } else if (!(safe['issuer'] as Record<string, unknown>)['name']) {
    safe['issuer'] = { ...(safe['issuer'] as Record<string, unknown>), name: '' };
  }
  if (typeof safe['recipient'] !== 'object' || safe['recipient'] === null) {
    safe['recipient'] = { name: '' };
  } else if (!(safe['recipient'] as Record<string, unknown>)['name']) {
    safe['recipient'] = { ...(safe['recipient'] as Record<string, unknown>), name: '' };
  }
  if (!Array.isArray(safe['items'])) safe['items'] = [];
  return safe as unknown as Invoice;
}

export const invoiceProvider = createSchemaPreview<Invoice>({
  meta: {
    id: 'invoice',
    label: '請求書',
    markers: ['invoiceNumber', '請求書番号', 'items', '品目', 'issuer', '発行元'],
  },
  normalize: normalizeInvoiceFrontmatter,
  autofill: autofillInvoice,
  validate: validateInvoice,
  translateErrors: translateInvoiceErrors,
  translateWarnings: translateInvoiceWarnings,
  withPreviewDefaults,
  documentTitle: (data) => `請求書 ${data.invoiceNumber}`,
  // データ駆動スキーマは frontmatter のみで描くため body は無視する。
  renderBody: (data) => renderInvoiceBody(data),
  // 画面プレビューだけ用紙が端に詰まって見えるため、@media screen で余白を足す。
  // 印刷（PDF 出力）は @page margin が効くので screen 限定にし、正本の invoice.css
  // （PDF / chrome-extension 共用）には手を入れない。
  css: `${invoiceCss}\n@media screen { body { padding: 28px 24px; } }`,
});
