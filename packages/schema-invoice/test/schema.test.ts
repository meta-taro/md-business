import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { parseAndValidate } from '@md-business/core/runtime';
import { invoiceSchema, SCHEMA_VERSION } from '../src/index.js';
import type { Invoice } from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const templatesDir = resolve(here, '../../../templates/invoice');

function loadTemplate(name: string): string {
  return readFileSync(resolve(templatesDir, name), 'utf8');
}

describe('invoiceSchema constants', () => {
  it('exports the schema as an object', () => {
    expect(typeof invoiceSchema).toBe('object');
  });

  it('exposes SCHEMA_VERSION constant', () => {
    expect(SCHEMA_VERSION).toBe('invoice/v1');
  });
});

describe('templates/invoice/standard.md', () => {
  it('passes schema validation', () => {
    const result = parseAndValidate<Invoice>(loadTemplate('standard.md'), invoiceSchema);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.frontmatter.schemaVersion).toBe('invoice/v1');
      expect(result.frontmatter.issuer.registrationNumber).toMatch(/^T\d{13}$/);
      expect(result.frontmatter.items).toHaveLength(1);
      expect(result.frontmatter.totals.total).toBe(550000);
    }
  });
});

describe('templates/invoice/inbound-eligible.md', () => {
  it('passes schema validation with mixed tax rates', () => {
    const result = parseAndValidate<Invoice>(loadTemplate('inbound-eligible.md'), invoiceSchema);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const { taxSummary, items } = result.frontmatter;
      expect(taxSummary.standard.subtotal).toBe(300000);
      expect(taxSummary.reduced.subtotal).toBe(14400);
      const reducedItems = items.filter((i) => i.taxRate === 8);
      expect(reducedItems.length).toBeGreaterThan(0);
      expect(reducedItems.every((i) => i.isReducedRate === true)).toBe(true);
    }
  });
});

describe('schema validation — error cases', () => {
  function buildInvoice(): Record<string, unknown> {
    return {
      schemaVersion: 'invoice/v1',
      invoiceNumber: 'INV-TEST-0001',
      issueDate: '2026-06-30',
      issuer: { name: '発行者', registrationNumber: 'T1234567890123' },
      recipient: { name: '受領者' },
      items: [{ name: '商品', quantity: 1, unitPrice: 1000, taxRate: 10 }],
      taxSummary: {
        standard: { rate: 10, subtotal: 1000, tax: 100 },
        reduced: { rate: 8, subtotal: 0, tax: 0 },
        exempt: { rate: 0, subtotal: 0, tax: 0 },
      },
      totals: { subtotal: 1000, tax: 100, total: 1100 },
    };
  }

  function toFrontmatter(data: Record<string, unknown>): string {
    const yaml = Object.entries(data)
      .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
      .join('\n');
    return `---\n${yaml}\n---\n`;
  }

  it('rejects missing T-number', () => {
    const data = buildInvoice();
    (data['issuer'] as Record<string, unknown>) = { name: '発行者' };
    const result = parseAndValidate<Invoice>(toFrontmatter(data), invoiceSchema);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.path.includes('issuer'))).toBe(true);
    }
  });

  it('rejects an invalid T-number format', () => {
    const data = buildInvoice();
    (data['issuer'] as Record<string, unknown>) = {
      name: '発行者',
      registrationNumber: '1234567890123',
    };
    const result = parseAndValidate<Invoice>(toFrontmatter(data), invoiceSchema);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.path.includes('registrationNumber'))).toBe(true);
    }
  });

  it('rejects a tax rate that is not 0 / 8 / 10', () => {
    const data = buildInvoice();
    (data['items'] as unknown[]) = [
      { name: 'item', quantity: 1, unitPrice: 1000, taxRate: 5 },
    ];
    const result = parseAndValidate<Invoice>(toFrontmatter(data), invoiceSchema);
    expect(result.ok).toBe(false);
  });

  it('rejects an empty items array', () => {
    const data = buildInvoice();
    (data['items'] as unknown[]) = [];
    const result = parseAndValidate<Invoice>(toFrontmatter(data), invoiceSchema);
    expect(result.ok).toBe(false);
  });

  it('rejects a missing recipient', () => {
    const data = buildInvoice();
    delete data['recipient'];
    const result = parseAndValidate<Invoice>(toFrontmatter(data), invoiceSchema);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.message.includes('recipient'))).toBe(true);
    }
  });

  it('rejects a wrong schemaVersion', () => {
    const data = buildInvoice();
    data['schemaVersion'] = 'invoice/v2';
    const result = parseAndValidate<Invoice>(toFrontmatter(data), invoiceSchema);
    expect(result.ok).toBe(false);
  });
});
