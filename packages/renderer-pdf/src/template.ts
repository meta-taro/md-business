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
}, extras: { stampSvg?: string; logoUrl?: string } = {}): string {
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
  const logoMarkup = extras.logoUrl
    ? `<div class="mdb-invoice__logo"><img src="${escapeHtml(extras.logoUrl)}" alt=""></div>`
    : '';
  return `
    <section class="mdb-invoice__party">
      <h2>${escapeHtml(label)}</h2>
      ${logoMarkup}
      <div class="name">${escapeHtml(party.name)}${honorific}${stampMarkup}</div>
      ${lines.join('\n      ')}
      ${registration}
    </section>
  `;
}

/**
 * Accent color presets. Hex values picked to be visually distinct yet
 * print-safe (≥40% darkness so 2px borders remain legible). Authors who
 * need a brand-specific color can pass an explicit `#rrggbb` instead.
 */
const THEME_PRESETS: Record<string, string> = {
  blue: '#2a4d7a',
  red: '#b91c1c',
  yellow: '#b8860b',
  orange: '#c2410c',
  purple: '#6d28d9',
  black: '#1f1f1f',
  gray: '#4b5563',
};

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

function resolveThemeColor(theme: string | undefined): string | null {
  if (!theme) return null;
  const trimmed = theme.trim();
  if (!trimmed) return null;
  const preset = THEME_PRESETS[trimmed.toLowerCase()];
  if (preset) return preset;
  if (HEX_COLOR.test(trimmed)) return trimmed;
  return null;
}

// Logo URL whitelist. Inline data URIs are allowed for the four raster
// formats every browser renders natively (and that Chrome's print pipeline
// keeps in the PDF). SVG is excluded because data:image/svg+xml can carry
// <script> and external references; plain https is allowed for hosted logos
// but http:// is rejected to keep mixed-content out of the preview frame.
const LOGO_DATA_URL = /^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+$/;
const LOGO_HTTPS_URL = /^https:\/\/[^\s<>"']+$/;

function sanitizeLogoUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (LOGO_DATA_URL.test(trimmed)) return trimmed;
  if (LOGO_HTTPS_URL.test(trimmed)) return trimmed;
  return null;
}

/**
 * Split an item name of the form `"テキスト|12px"` into its visible name and
 * an optional inline font size. Authors use this to shrink long product names
 * so they fit a single row without forcing every other row down.
 *
 * Rules:
 *   - Only the LAST `|<num><unit>` suffix is treated as a size, so names that
 *     legitimately contain `|` remain unaffected as long as the trailing token
 *     does not match the size pattern.
 *   - Supported units: px, pt, em (CSS lengths the print stylesheet honors).
 *   - `\|` escapes a literal pipe in the visible name.
 */
function parseItemName(raw: string): { name: string; fontSize?: string } {
  const m = raw.match(/^(.*?)(?<!\\)\|(\d+(?:\.\d+)?(?:px|pt|em))$/);
  if (!m) return { name: raw.replace(/\\\|/g, '|') };
  return {
    name: (m[1] ?? '').replace(/\\\|/g, '|'),
    fontSize: m[2] ?? '',
  };
}

function renderItemRow(item: InvoiceItem): string {
  const subtotal = item.quantity * item.unitPrice;
  const reducedMark =
    item.taxRate === 8 || item.isReducedRate
      ? '<span class="reduced-mark" aria-label="軽減税率対象">※</span>'
      : '';
  const unit = item.unit ? escapeHtml(item.unit) : '';
  const { name, fontSize } = parseItemName(item.name);
  // Inline style is the right tool here: per-row font-size overrides have no
  // good CSS-class proxy, and we already trust `fontSize` because it matches
  // a strict numeric+unit regex above.
  const nameStyle = fontSize ? ` style="font-size:${fontSize}"` : '';
  return `
    <tr>
      <td${nameStyle}>${reducedMark}${escapeHtml(name)}</td>
      <td class="numeric">${formatNumber(item.quantity)}</td>
      <td class="center">${unit}</td>
      <td class="numeric">${formatJpy(item.unitPrice)}</td>
      <td class="center">${escapeHtml(item.taxRate)}%</td>
      <td class="numeric">${formatJpy(subtotal)}</td>
    </tr>
  `;
}

// Japanese invoice convention: pad the item table to a fixed visual row count
// so the layout stays balanced even with 1–2 line items. Empty rows preserve
// column widths and table borders so the document does not look "half-filled".
function renderEmptyItemRow(): string {
  return `
    <tr class="empty" aria-hidden="true">
      <td>&nbsp;</td>
      <td></td>
      <td></td>
      <td></td>
      <td></td>
      <td></td>
    </tr>
  `;
}

const DEFAULT_MIN_ITEM_ROWS = 5;

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
  /**
   * Minimum number of visual rows in the items table. When `items[]` is
   * shorter, the remaining rows render as empty placeholders so the table
   * looks complete on the printed page — matches the Japanese 請求書
   * convention of fixed-height item grids. Defaults to 5.
   */
  minItemRows?: number;
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
  const { signatureArea = true, minItemRows = DEFAULT_MIN_ITEM_ROWS } = options;
  const emptyRowCount = Math.max(0, minItemRows - invoice.items.length);
  const itemsMarkup =
    invoice.items.map(renderItemRow).join('') +
    Array.from({ length: emptyRowCount }, renderEmptyItemRow).join('');
  const dueLine = invoice.dueDate
    ? `<dt>支払期限</dt><dd>${escapeHtml(formatDateIso(invoice.dueDate))}</dd>`
    : '';
  const notes = invoice.notes
    ? `<section class="mdb-invoice__notes">${escapeHtml(invoice.notes)}</section>`
    : '';
  const stamp = renderStampForInvoice(invoice);
  const logoUrl = sanitizeLogoUrl(invoice.logo);
  // Stamp is overlaid on the 発行元 party box (top-right corner) — the
  // conventional Japanese-invoice layout where the seal partially overlaps
  // the issuer's address. This keeps a single-page invoice on one page
  // instead of pushing a trailing signature block onto page 2.
  const issuerExtras: { stampSvg?: string; logoUrl?: string } = {};
  if (stamp) issuerExtras.stampSvg = stamp.svg;
  if (logoUrl) issuerExtras.logoUrl = logoUrl;
  const fallbackSignature =
    !stamp && signatureArea
      ? `<section class="mdb-invoice__signature"><div class="seal-area">印</div></section>`
      : '';
  const themeColor = resolveThemeColor(invoice.theme);
  const themeStyle = themeColor ? ` style="--mdb-color-accent:${themeColor}"` : '';

  // 免税事業者モード: 適格請求書発行事業者ではない（登録番号なし）旨を
  // タイトル直下と備考末尾に明示。インボイス制度経過措置（2023-10〜2029-9）
  // に基づき仕入税額控除が段階的に縮小されるため、受領者が判断できるよう必須。
  const isTaxExempt = invoice.issuer.taxExemptIssuer === true;
  const taxExemptAttr = isTaxExempt ? ' data-tax-exempt="true"' : '';
  const nonQualifiedNotice = isTaxExempt
    ? `<p class="mdb-invoice__non-qualified-notice">※ 適格請求書ではありません（インボイス制度経過措置の対象）</p>`
    : '';
  const transitionNotice = isTaxExempt
    ? `<section class="mdb-invoice__transition-notice">本請求書は適格請求書発行事業者以外が発行したものです。インボイス制度の経過措置（2023年10月〜2029年9月）の範囲で仕入税額控除を行ってください。</section>`
    : '';

  return `
    <article class="mdb-invoice" data-schema-version="${escapeHtml(invoice.schemaVersion)}"${taxExemptAttr}${themeStyle}>
      <header class="mdb-invoice__header">
        <div>
          <h1 class="mdb-invoice__title">請求書</h1>
          ${nonQualifiedNotice}
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
          ${itemsMarkup}
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
      ${transitionNotice}
      ${notes}
      ${fallbackSignature}
    </article>
  `;
}
