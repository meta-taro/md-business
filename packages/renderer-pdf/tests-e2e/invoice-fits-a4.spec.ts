import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import pdfParse from 'pdf-parse';
import { splitFrontmatter } from '../../core/src/frontmatter.js';
import { normalizeInvoiceFrontmatter } from '../../schema-invoice/src/normalize.js';
import { autofillInvoice } from '../../schema-invoice/src/autofill.js';
import type { Invoice } from '../../schema-invoice/src/types.js';
import { renderInvoiceHtml } from '../src/renderHtml.js';

// E2E では JSON-Schema validation はスキップする（ajv compiled の internal
// import が Playwright の Node ESM resolver で解決できないため）。
// 「テンプレが schema を満たすか」は schema-invoice の vitest テストが
// 既に verify 済み。ここでの関心は「parse 済み Invoice をレンダした PDF
// の物理ページ数」だけ。
function parseTemplateForLayout(md: string): Invoice {
  const split = splitFrontmatter(md);
  const normalized = normalizeInvoiceFrontmatter(split.data);
  const autofilled = autofillInvoice(normalized.data);
  return autofilled.data as unknown as Invoice;
}

const here = dirname(fileURLToPath(import.meta.url));
const templatesDir = resolve(here, '../../../templates/invoice');
const invoiceCss = readFileSync(resolve(here, '../src/styles/invoice.css'), 'utf8');

/**
 * Templates that MUST render on a single A4 portrait page.
 *
 * - standard-ja: 3 品目の標準的な適格請求書（過去 b3d9294 / bccf3b3 で
 *   1 ページ化を確認済み）
 * - tax-exempt-ja: 1 品目の免税事業者請求書 + 経過措置案内（v0.4.0 で
 *   regression、b3d9294 で再度収まる「見込み」と書いたが、本テストで
 *   恒久 verify を取る）
 * - inbound-eligible: インバウンド向け（消費税 0 対象品目あり）
 */
const templates = ['standard-ja.md', 'tax-exempt-ja.md', 'inbound-eligible.md'] as const;

for (const filename of templates) {
  test(`${filename} renders within a single A4 portrait page`, async ({ page }) => {
    const md = readFileSync(resolve(templatesDir, filename), 'utf8');
    const invoice = parseTemplateForLayout(md);
    const html = renderInvoiceHtml(invoice, { embedStyles: invoiceCss });
    await page.setContent(html, { waitUntil: 'load' });

    // Chromium honours the CSS `@page { size: A4 portrait; margin: ... }`
    // declared in invoice.css when `preferCSSPageSize: true` is set, which is
    // exactly what we want — the test should fail if the *CSS* lets the layout
    // overflow, not because Playwright forces a different page geometry.
    const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });

    const parsed = await pdfParse(pdf);
    expect(
      parsed.numpages,
      `${filename} overflowed onto ${parsed.numpages} pages — invoice.css余白 / minItemRows / transition-notice の累積を見直してください`,
    ).toBe(1);
  });
}
