import { describe, it, expect } from 'vitest';
import { autofillInvoice } from '../src/autofill.js';

describe('autofillInvoice', () => {
  it('computes taxSummary and totals from items (10% only)', () => {
    const { data } = autofillInvoice({
      items: [
        { name: 'A', quantity: 1, unitPrice: 100000, taxRate: 10 },
        { name: 'B', quantity: 2, unitPrice: 50000, taxRate: 10 },
      ],
    });
    expect(data['taxSummary']).toEqual({
      standard: { rate: 10, subtotal: 200000, tax: 20000 },
      reduced: { rate: 8, subtotal: 0, tax: 0 },
      exempt: { rate: 0, subtotal: 0, tax: 0 },
    });
    expect(data['totals']).toEqual({ subtotal: 200000, tax: 20000, total: 220000 });
  });

  it('splits into per-rate buckets with mixed 10/8/0 items', () => {
    const { data } = autofillInvoice({
      items: [
        { name: 'A', quantity: 1, unitPrice: 100000, taxRate: 10 },
        { name: 'B', quantity: 2, unitPrice: 5000, taxRate: 8 },
        { name: 'C', quantity: 1, unitPrice: 2000, taxRate: 0 },
      ],
    });
    const summary = data['taxSummary'] as Record<string, { subtotal: number; tax: number }>;
    expect(summary['standard']?.subtotal).toBe(100000);
    expect(summary['standard']?.tax).toBe(10000);
    expect(summary['reduced']?.subtotal).toBe(10000);
    expect(summary['reduced']?.tax).toBe(800);
    expect(summary['exempt']?.subtotal).toBe(2000);
    expect(summary['exempt']?.tax).toBe(0);
  });

  it('defaults to floor rounding (matches 適格請求書 B2B convention)', () => {
    const { data } = autofillInvoice({
      // 333 * 10 = 3330, tax @ 10% = 333.0 (no rounding needed)
      // Use 3335 * 1 = 3335, tax = 333.5 — floor -> 333
      items: [{ name: 'A', quantity: 1, unitPrice: 3335, taxRate: 10 }],
    });
    const summary = data['taxSummary'] as Record<string, { tax: number }>;
    expect(summary['standard']?.tax).toBe(333);
  });

  it('honors taxRounding=round and taxRounding=ceil', () => {
    const round = autofillInvoice({
      taxRounding: 'round',
      items: [{ name: 'A', quantity: 1, unitPrice: 3335, taxRate: 10 }],
    });
    const ceil = autofillInvoice({
      taxRounding: 'ceil',
      items: [{ name: 'A', quantity: 1, unitPrice: 3335, taxRate: 10 }],
    });
    expect((round.data['taxSummary'] as Record<string, { tax: number }>)['standard']?.tax).toBe(334);
    expect((ceil.data['taxSummary'] as Record<string, { tax: number }>)['standard']?.tax).toBe(334);
  });

  it('auto-flags 8% items with isReducedRate=true', () => {
    const { data } = autofillInvoice({
      items: [{ name: 'A', quantity: 1, unitPrice: 1000, taxRate: 8 }],
    });
    const items = data['items'] as Array<Record<string, unknown>>;
    expect(items[0]?.['isReducedRate']).toBe(true);
  });

  it('warns when supplied totals disagree with computed totals', () => {
    const { warnings } = autofillInvoice({
      items: [{ name: 'A', quantity: 1, unitPrice: 1000, taxRate: 10 }],
      totals: { subtotal: 999, tax: 100, total: 1100 },
    });
    const subtotalWarn = warnings.find((w) => w.path === 'totals.subtotal');
    expect(subtotalWarn).toBeDefined();
    expect(subtotalWarn?.message).toMatch(/指定値 999/);
  });

  it('removes the taxRounding directive so it does not leak past additionalProperties:false', () => {
    const { data } = autofillInvoice({
      taxRounding: 'floor',
      items: [{ name: 'A', quantity: 1, unitPrice: 1000, taxRate: 10 }],
    });
    expect(data['taxRounding']).toBeUndefined();
  });

  it('defaults schemaVersion when omitted', () => {
    const { data } = autofillInvoice({
      items: [{ name: 'A', quantity: 1, unitPrice: 1000, taxRate: 10 }],
    });
    expect(data['schemaVersion']).toBe('invoice/v1');
  });

  it('returns empty data for non-object input (defensive)', () => {
    const { data, warnings } = autofillInvoice(null);
    expect(data).toEqual({});
    expect(warnings).toEqual([]);
  });

  it('tolerates non-array items field without throwing', () => {
    const { data } = autofillInvoice({ items: 'not-an-array' });
    expect((data['totals'] as { total: number }).total).toBe(0);
  });

  it('warns when 8% item is explicitly marked isReducedRate=false', () => {
    const { warnings } = autofillInvoice({
      items: [{ name: 'A', quantity: 1, unitPrice: 1000, taxRate: 8, isReducedRate: false }],
    });
    expect(warnings.some((w) => w.path === 'items[0].isReducedRate')).toBe(true);
  });

  it('warns on supplied taxSummary mismatch', () => {
    const { warnings } = autofillInvoice({
      items: [{ name: 'A', quantity: 1, unitPrice: 1000, taxRate: 10 }],
      taxSummary: {
        standard: { rate: 10, subtotal: 9999, tax: 9999 },
        reduced: { rate: 8, subtotal: 0, tax: 0 },
        exempt: { rate: 0, subtotal: 0, tax: 0 },
      },
    });
    expect(warnings.some((w) => w.path === 'taxSummary.standard.subtotal')).toBe(true);
    expect(warnings.some((w) => w.path === 'taxSummary.standard.tax')).toBe(true);
  });

  it('warns when issuer has both registrationNumber and taxExemptIssuer (相互排他)', () => {
    const { warnings } = autofillInvoice({
      issuer: { name: 'X', registrationNumber: 'T1234567890123', taxExemptIssuer: true },
      items: [{ name: 'A', quantity: 1, unitPrice: 1000, taxRate: 10 }],
    });
    expect(warnings.some((w) => w.path === 'issuer.taxExemptIssuer')).toBe(true);
  });

  it('warns when issuer has neither registrationNumber nor taxExemptIssuer', () => {
    const { warnings } = autofillInvoice({
      issuer: { name: 'X' },
      items: [{ name: 'A', quantity: 1, unitPrice: 1000, taxRate: 10 }],
    });
    expect(warnings.some((w) => w.path === 'issuer.registrationNumber')).toBe(true);
  });

  it('does not warn for valid 適格事業者 (registrationNumber 指定 / taxExemptIssuer 未指定)', () => {
    const { warnings } = autofillInvoice({
      issuer: { name: 'X', registrationNumber: 'T1234567890123' },
      items: [{ name: 'A', quantity: 1, unitPrice: 1000, taxRate: 10 }],
    });
    expect(warnings.some((w) => w.path.startsWith('issuer.'))).toBe(false);
  });

  it('does not warn for valid 免税事業者 (taxExemptIssuer: true / registrationNumber 未指定)', () => {
    const { warnings } = autofillInvoice({
      issuer: { name: 'X', taxExemptIssuer: true },
      items: [{ name: 'A', quantity: 1, unitPrice: 1000, taxRate: 10 }],
    });
    expect(warnings.some((w) => w.path.startsWith('issuer.'))).toBe(false);
  });

  it('ignores items whose taxRate is invalid (skipped silently — schema validation catches it)', () => {
    const { data } = autofillInvoice({
      items: [
        { name: 'A', quantity: 1, unitPrice: 1000, taxRate: 5 },
        { name: 'B', quantity: 1, unitPrice: 1000, taxRate: 10 },
      ],
    });
    expect((data['totals'] as { subtotal: number }).subtotal).toBe(1000);
  });
});
