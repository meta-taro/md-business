import type {
  Invoice,
  InvoiceItem,
  InvoiceTaxBucket,
} from '@md-business/schema-invoice';
import { escapeHtml } from './escape.js';
import { formatJpy, formatNumber, formatDateIso } from './format.js';
import { renderStampSvg } from './stamp.js';

function renderParty(label: string, party: {
  name: string;
  honorific?: string;
  postalCode?: string;
  address?: string;
  registrationNumber?: string;
  tel?: string;
  email?: string;
}, extras: { stampSvg?: string } = {}): string {
  const honorific = party.honorific ? ` ${escapeHtml(party.honorific)}` : '';
  const lines: string[] = [];
  if (party.postalCode) {
    lines.push(`<div>〒${escapeHtml(party.postalCode)}</div>`);
  }
  if (party.address) {
    lines.push(`<div>${escapeHtml(party.address)}</div>`);
  }
  if (party.tel) {
    lines.push(`<div>TEL: ${escapeHtml(party.tel)}</div>`);
  }
  if (party.email) {
    lines.push(`<div>Email: ${escapeHtml(party.email)}</div>`);
  }
  const registration = party.registrationNumber
    ? `<div class="mdb-invoice__registration">登録番号: ${escapeHtml(party.registrationNumber)}</div>`
    : '';
  // The stamp rides inline alongside the issuer name so it always flows with
  // the name on the same page. Inline placement avoids Paged.js's absolute-
  // positioning edge cases that previously pushed the seal to page 2.
  const stampMarkup = extras.stampSvg
    ? `<span class="mdb-stamp-frame">${extras.stampSvg}</span>`
    : '';
  return `
    <section class="mdb-invoice__party">
      <h2>${escapeHtml(label)}</h2>
      <div class="name">${escapeHtml(party.name)}${honorific}${stampMarkup}</div>
      ${lines.join('\n      ')}
      ${registration}
    </section>
  `;
}

function renderItemRow(item: InvoiceItem): string {
  const subtotal = item.quantity * item.unitPrice;
  const reducedMark =
    item.taxRate === 8 || item.isReducedRate
      ? '<span class="reduced-mark" aria-label="軽減税率対象">※</span>'
      : '';
  const unit = item.unit ? escapeHtml(item.unit) : '';
  return `
    <tr>
      <td>${reducedMark}${escapeHtml(item.name)}</td>
      <td class="numeric">${formatNumber(item.quantity)}</td>
      <td class="center">${unit}</td>
      <td class="numeric">${formatJpy(item.unitPrice)}</td>
      <td class="center">${escapeHtml(item.taxRate)}%</td>
      <td class="numeric">${formatJpy(subtotal)}</td>
    </tr>
  `;
}

function renderTaxBucketRow(label: string, bucket: InvoiceTaxBucket): string {
  if (bucket.subtotal === 0 && bucket.tax === 0) return '';
  return `
    <tr>
      <td>${escapeHtml(label)}（${escapeHtml(bucket.rate)}%）</td>
      <td class="numeric">${formatJpy(bucket.subtotal)}</td>
      <td class="numeric">${formatJpy(bucket.tax)}</td>
    </tr>
  `;
}

function renderPayment(invoice: Invoice): string {
  const p = invoice.paymentInfo;
  if (!p) return '';
  const rows: string[] = [];
  if (p.bankName) rows.push(`<dt>銀行</dt><dd>${escapeHtml(p.bankName)}</dd>`);
  if (p.branchName) rows.push(`<dt>支店</dt><dd>${escapeHtml(p.branchName)}</dd>`);
  if (p.accountType) rows.push(`<dt>種別</dt><dd>${escapeHtml(p.accountType)}</dd>`);
  if (p.accountNumber) rows.push(`<dt>口座番号</dt><dd>${escapeHtml(p.accountNumber)}</dd>`);
  if (p.accountHolder) rows.push(`<dt>名義</dt><dd>${escapeHtml(p.accountHolder)}</dd>`);
  if (rows.length === 0) return '';
  return `
    <section class="mdb-invoice__payment">
      <h3>お振込先</h3>
      <dl>${rows.join('')}</dl>
    </section>
  `;
}

export interface RenderInvoiceBodyOptions {
  signatureArea?: boolean;
}

function renderStampForInvoice(invoice: Invoice) {
  const s = invoice.stamp;
  if (!s) return null;
  if (s.enabled === false) return null;
  return renderStampSvg({
    text: s.text ?? invoice.issuer.name,
    shape: s.shape ?? 'auto',
    ...(s.font ? { font: s.font } : {}),
  });
}

export function renderInvoiceBody(invoice: Invoice, options: RenderInvoiceBodyOptions = {}): string {
  const { signatureArea = true } = options;
  const dueLine = invoice.dueDate
    ? `<dt>支払期限</dt><dd>${escapeHtml(formatDateIso(invoice.dueDate))}</dd>`
    : '';
  const notes = invoice.notes
    ? `<section class="mdb-invoice__notes">${escapeHtml(invoice.notes)}</section>`
    : '';
  const stamp = renderStampForInvoice(invoice);
  // Stamp is overlaid on the 発行元 party box (top-right corner) — the
  // conventional Japanese-invoice layout where the seal partially overlaps
  // the issuer's address. This keeps a single-page invoice on one page
  // instead of pushing a trailing signature block onto page 2.
  const issuerExtras = stamp ? { stampSvg: stamp.svg } : {};
  const fallbackSignature =
    !stamp && signatureArea
      ? `<section class="mdb-invoice__signature"><div class="seal-area">印</div></section>`
      : '';

  return `
    <article class="mdb-invoice" data-schema-version="${escapeHtml(invoice.schemaVersion)}">
      <header class="mdb-invoice__header">
        <div>
          <h1 class="mdb-invoice__title">請求書</h1>
          <div>${escapeHtml(invoice.recipient.name)}${invoice.recipient.honorific ? ' ' + escapeHtml(invoice.recipient.honorific) : ''} へ</div>
        </div>
        <div class="mdb-invoice__meta">
          <dl>
            <dt>請求書番号</dt><dd>${escapeHtml(invoice.invoiceNumber)}</dd>
            <dt>発行日</dt><dd>${escapeHtml(formatDateIso(invoice.issueDate))}</dd>
            ${dueLine}
          </dl>
        </div>
      </header>

      <section class="mdb-invoice__parties">
        ${renderParty('請求先', invoice.recipient)}
        ${renderParty('発行元', { ...invoice.issuer }, issuerExtras)}
      </section>

      <table class="mdb-invoice__items">
        <thead>
          <tr>
            <th>品目</th>
            <th>数量</th>
            <th>単位</th>
            <th>単価</th>
            <th>税率</th>
            <th>小計</th>
          </tr>
        </thead>
        <tbody>
          ${invoice.items.map(renderItemRow).join('')}
        </tbody>
      </table>

      <section class="mdb-invoice__totals">
        <div class="mdb-invoice__tax-summary">
          <h3>税率別小計</h3>
          <table>
            <thead>
              <tr><th>区分</th><th class="numeric">税抜小計</th><th class="numeric">消費税</th></tr>
            </thead>
            <tbody>
              ${renderTaxBucketRow('標準税率', invoice.taxSummary.standard)}
              ${renderTaxBucketRow('軽減税率', invoice.taxSummary.reduced)}
              ${renderTaxBucketRow('非課税', invoice.taxSummary.exempt)}
            </tbody>
          </table>
        </div>
        <div class="mdb-invoice__grand-total">
          <div class="label">ご請求金額（税込）</div>
          <div class="amount">${formatJpy(invoice.totals.total)}</div>
        </div>
      </section>

      ${renderPayment(invoice)}
      ${notes}
      ${fallbackSignature}
    </article>
  `;
}
