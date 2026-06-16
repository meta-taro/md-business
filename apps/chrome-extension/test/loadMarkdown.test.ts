import { describe, it, expect } from 'vitest';
import { loadMarkdown } from '../src/shared/loadMarkdown.js';

const VALID_INVOICE_MD = `---
schemaVersion: "invoice/v1"
invoiceNumber: "INV-2026-0001"
issueDate: "2026-06-30"
issuer:
  name: "株式会社サンプル"
  registrationNumber: "T1234567890123"
recipient:
  name: "株式会社受領先"
items:
  - name: "業務委託費"
    quantity: 1
    unitPrice: 500000
    taxRate: 10
taxSummary:
  standard:
    rate: 10
    subtotal: 500000
    tax: 50000
  reduced:
    rate: 8
    subtotal: 0
    tax: 0
  exempt:
    rate: 0
    subtotal: 0
    tax: 0
totals:
  subtotal: 500000
  tax: 50000
  total: 550000
---

# Invoice body (ignored by renderer for now)
`;

describe('loadMarkdown — happy path', () => {
  it('renders valid invoice frontmatter to HTML', () => {
    const result = loadMarkdown(VALID_INVOICE_MD);
    if (!result.ok) throw new Error(`expected success, got: ${result.reason}`);
    expect(result.pluginId).toBe('invoice');
    expect(result.bodyHtml).toContain('mdb-invoice');
    expect(result.bodyHtml).toContain('INV-2026-0001');
    expect(result.stylesHref).toBe('styles/invoice.css');
    expect(result.documentTitle).toBe('請求書 INV-2026-0001');
  });

  it('honors an explicit pluginId override', () => {
    const result = loadMarkdown(VALID_INVOICE_MD, { pluginId: 'invoice' });
    expect(result.ok).toBe(true);
  });
});

describe('loadMarkdown — failure modes', () => {
  it('reports validation errors for invalid frontmatter', () => {
    const badMd = `---
schemaVersion: "invoice/v1"
invoiceNumber: "INV-1"
issueDate: "2026-06-30"
issuer:
  name: "X"
  registrationNumber: "INVALID"
recipient:
  name: "Y"
items: []
taxSummary:
  standard: { rate: 10, subtotal: 0, tax: 0 }
  reduced: { rate: 8, subtotal: 0, tax: 0 }
  exempt: { rate: 0, subtotal: 0, tax: 0 }
totals: { subtotal: 0, tax: 0, total: 0 }
---
`;
    const result = loadMarkdown(badMd);
    if (result.ok) throw new Error('expected failure');
    expect(result.reason).toMatch(/不備/);
    // Errors are now translated to Japanese; registrationNumber appears as
    // "発行元の登録番号".
    expect(result.details?.join('\n')).toMatch(/登録番号/);
  });

  it('returns Japanese-translated error messages for missing required fields', () => {
    // Missing recipient.name — most common author mistake.
    const md = `---
schemaVersion: "invoice/v1"
invoiceNumber: "INV-1"
issueDate: "2026-06-30"
issuer:
  name: "X"
  registrationNumber: "T1234567890123"
recipient: {}
items:
  - name: "A"
    quantity: 1
    unitPrice: 1000
    taxRate: 10
---
`;
    const result = loadMarkdown(md);
    if (result.ok) throw new Error('expected failure');
    expect(result.details).toEqual(
      expect.arrayContaining([expect.stringMatching(/請求先の名前.*必須/)]),
    );
  });

  it('exposes autofill warnings through the success path', () => {
    // Supplied totals deliberately mismatch the items[] truth.
    const md = `---
schemaVersion: "invoice/v1"
invoiceNumber: "INV-2"
issueDate: "2026-06-30"
issuer:
  name: "X"
  registrationNumber: "T1234567890123"
recipient:
  name: "Y"
items:
  - name: "A"
    quantity: 1
    unitPrice: 1000
    taxRate: 10
totals:
  subtotal: 999
  tax: 100
  total: 1099
---
`;
    const result = loadMarkdown(md);
    if (!result.ok) throw new Error('expected success');
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.join('\n')).toMatch(/小計|税込合計/);
  });

  it('falls back to a clear error when no plugin matches', () => {
    const md = `---
title: "just a note"
---

body
`;
    const result = loadMarkdown(md);
    if (result.ok) throw new Error('expected failure');
    expect(result.reason).toMatch(/対応するスキーマ/);
  });

  it('rejects an unknown explicit pluginId by leaving auto-detection in charge', () => {
    const result = loadMarkdown(VALID_INVOICE_MD, { pluginId: 'design-doc' });
    expect(result.ok).toBe(true); // falls back to schemaVersion auto-detect
  });
});
