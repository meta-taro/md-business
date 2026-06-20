import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import validate from '../dist/validate.compiled.js';
import { parseInvoiceMarkdown, parseInvoiceObject } from '../src/parseInvoice.js';
import { renderInvoiceFileName } from '../src/fileName.js';

const here = dirname(fileURLToPath(import.meta.url));
const templatesDir = resolve(here, '../../../templates/invoice');

function loadTemplate(name: string): string {
  return readFileSync(resolve(templatesDir, name), 'utf8');
}

describe('parseInvoiceMarkdown — Japanese frontmatter + autofill', () => {
  it('parses templates/invoice/standard-ja.md end to end', () => {
    const result = parseInvoiceMarkdown(loadTemplate('standard-ja.md'), validate);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.invoice.invoiceNumber).toBe('INV-2026-0042');
    expect(result.invoice.issuer.name).toBe('株式会社サンプル発行元');
    expect(result.invoice.recipient.honorific).toBe('御中');
    expect(result.invoice.items).toHaveLength(3);
    // Autofilled — sample expected: 500000 + 12000 (10%) + 3500 (8%)
    expect(result.invoice.taxSummary.standard.subtotal).toBe(512000);
    expect(result.invoice.taxSummary.standard.tax).toBe(51200);
    expect(result.invoice.taxSummary.reduced.subtotal).toBe(3500);
    expect(result.invoice.taxSummary.reduced.tax).toBe(280); // floor(3500*0.08)
    expect(result.invoice.totals.total).toBe(512000 + 51200 + 3500 + 280);
    // Reduced-rate flag was auto-set.
    expect(result.invoice.items[2]?.isReducedRate).toBe(true);
    // fileName template survived normalization.
    expect(result.invoice.fileName).toMatch(/御請求書/);
  });

  it('still passes the English template (standard.md) for backwards compat', () => {
    const result = parseInvoiceMarkdown(loadTemplate('standard.md'), validate);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.invoice.totals.total).toBe(550000);
  });

  it('renders pdf filename from the parsed invoice', () => {
    const result = parseInvoiceMarkdown(loadTemplate('standard-ja.md'), validate);
    if (!result.ok) throw new Error('parse failed');
    const name = renderInvoiceFileName(result.invoice, result.invoice.fileName);
    expect(name).toContain('株式会社サンプル受領先');
    expect(name).toContain('御中');
    expect(name).toMatch(/\d{8}$/);
  });
});

describe('parseInvoiceMarkdown — 免税事業者モード', () => {
  it('parses templates/invoice/tax-exempt-ja.md with taxExemptIssuer: true and no registrationNumber', () => {
    const result = parseInvoiceMarkdown(loadTemplate('tax-exempt-ja.md'), validate);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.invoice.issuer.taxExemptIssuer).toBe(true);
    expect(result.invoice.issuer.registrationNumber).toBeUndefined();
    expect(result.invoice.issuer.name).toBe('山田 太郎');
    // 90,000 + 9,000 (10%) = 99,000 (autofilled)
    expect(result.invoice.totals.total).toBe(99000);
    expect(result.invoice.taxSummary.standard.subtotal).toBe(90000);
    expect(result.invoice.taxSummary.standard.tax).toBe(9000);
  });

  it('does not emit issuer.registrationNumber or issuer.taxExemptIssuer warnings for the tax-exempt template', () => {
    const result = parseInvoiceMarkdown(loadTemplate('tax-exempt-ja.md'), validate);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const issuerWarnings = result.warnings.filter((w) => w.path.startsWith('issuer.'));
    expect(issuerWarnings).toEqual([]);
  });
});

describe('parseInvoiceObject — minimal Japanese input', () => {
  it('accepts an object with only items[] and Japanese party keys', () => {
    const result = parseInvoiceObject(
      {
        請求書番号: 'INV-X',
        発行日: '2026-06-01',
        発行元: { 名前: '甲', 登録番号: 'T1234567890123' },
        請求先: { 名前: '乙' },
        品目: [{ 名前: 'A', 数量: 1, 単価: 10000, 税率: 10 }],
      },
      validate,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.invoice.taxSummary.standard.subtotal).toBe(10000);
    expect(result.invoice.totals.total).toBe(11000);
  });
});
