import { describe, it, expect } from 'vitest';
import { renderInvoiceFileName } from '../src/fileName.js';
import type { Invoice } from '../src/types.js';

function build(overrides: Partial<Invoice> = {}): Invoice {
  return {
    schemaVersion: 'invoice/v1',
    invoiceNumber: 'INV-2026-0042',
    issueDate: '2026-06-30',
    issuer: { name: '株式会社サンプル', registrationNumber: 'T1234567890123' },
    recipient: { name: '株式会社B', honorific: '御中' },
    items: [{ name: 'A', quantity: 1, unitPrice: 1000, taxRate: 10 }],
    taxSummary: {
      standard: { rate: 10, subtotal: 1000, tax: 100 },
      reduced: { rate: 8, subtotal: 0, tax: 0 },
      exempt: { rate: 0, subtotal: 0, tax: 0 },
    },
    totals: { subtotal: 1000, tax: 100, total: 1100 },
    ...overrides,
  };
}

describe('renderInvoiceFileName', () => {
  it('falls back to the default template when none is provided', () => {
    const name = renderInvoiceFileName(build());
    expect(name).toBe('請求書_INV-2026-0042');
  });

  it('substitutes Japanese tokens', () => {
    const name = renderInvoiceFileName(build(), '御請求書_{請求先}{敬称}_{発行元}_{発行日YMD}');
    expect(name).toBe('御請求書_株式会社B御中_株式会社サンプル_20260630');
  });

  it('substitutes English alias tokens', () => {
    const name = renderInvoiceFileName(build(), '{invoiceNumber}_{issuer}_{issueDate}');
    expect(name).toBe('INV-2026-0042_株式会社サンプル_2026-06-30');
  });

  it('drops missing optional tokens cleanly (no honorific)', () => {
    const inv = build({ recipient: { name: '個人A' } });
    const name = renderInvoiceFileName(inv, '{請求先}{敬称}_{発行日YMD}');
    expect(name).toBe('個人A_20260630');
  });

  it('sanitizes Windows-forbidden characters', () => {
    const inv = build({ recipient: { name: 'A/B\\C:D' } });
    const name = renderInvoiceFileName(inv, '{請求先}_{請求書番号}');
    expect(name).not.toMatch(/[\\/:*?"<>|]/);
  });

  it('inserts today YMD via {YMD} token', () => {
    const name = renderInvoiceFileName(build(), '{YMD}');
    expect(name).toMatch(/^\d{8}$/);
  });

  it('inserts today ISO via {date} and {今日} tokens', () => {
    const a = renderInvoiceFileName(build(), '{date}');
    const b = renderInvoiceFileName(build(), '{今日}');
    expect(a).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(b).toBe(a);
  });

  it('treats an empty template as "no template" and uses the default', () => {
    const name = renderInvoiceFileName(build(), '   ');
    expect(name).toBe('請求書_INV-2026-0042');
  });

  it('drops unknown tokens silently', () => {
    const name = renderInvoiceFileName(build(), '{請求書番号}_{unknown}_x');
    expect(name).toBe('INV-2026-0042_x');
  });

  // 見積書に「{請求書番号}」と書かせるのは、書き手から見て種別と合わない。
  // 番号の入れ物は 1 つなので、どの言い方で書いても同じ値を差す。
  it('種別に合わせた番号トークンでも同じ番号を差す', () => {
    const quote = build({ documentType: '見積書', invoiceNumber: 'EST-2026-0042' });
    expect(renderInvoiceFileName(quote, '{見積書番号}')).toBe('EST-2026-0042');
    const receipt = build({ documentType: '領収書', invoiceNumber: 'RCP-2026-0042' });
    expect(renderInvoiceFileName(receipt, '{領収書番号}')).toBe('RCP-2026-0042');
    expect(renderInvoiceFileName(build(), '{文書番号}')).toBe('INV-2026-0042');
  });

  it('宛先も種別に合わせた言い方で書ける', () => {
    const quote = build({ documentType: '見積書' });
    expect(renderInvoiceFileName(quote, '{宛先}{敬称}')).toBe('株式会社B御中');
  });

  it('種別ごとの既定のファイル名は、その種別の番号の言い方で書ける', () => {
    const quote = build({ documentType: '見積書', invoiceNumber: 'EST-2026-0042' });
    expect(renderInvoiceFileName(quote)).toBe('見積書_EST-2026-0042');
    const receipt = build({ documentType: '領収書', invoiceNumber: 'RCP-2026-0042' });
    expect(renderInvoiceFileName(receipt)).toBe('領収書_RCP-2026-0042');
  });
});
