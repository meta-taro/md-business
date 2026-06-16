import { describe, it, expect } from 'vitest';
import { renderInvoiceBody } from '../src/template.js';
import { standardInvoice, mixedRateInvoice, xssInvoice } from './fixtures.js';

describe('renderInvoiceBody — standard invoice', () => {
  const html = renderInvoiceBody(standardInvoice());

  it('includes the document title', () => {
    expect(html).toContain('請求書');
  });

  it('includes issuer name and T-number', () => {
    expect(html).toContain('株式会社サンプル発行元');
    expect(html).toContain('T1234567890123');
  });

  it('includes recipient name + honorific', () => {
    expect(html).toContain('株式会社サンプル受領先');
    expect(html).toContain('御中');
  });

  it('includes formatted issue date and due date', () => {
    expect(html).toContain('2026年06月30日');
    expect(html).toContain('2026年07月31日');
  });

  it('includes grand total in JPY format', () => {
    expect(html).toMatch(/550,000/);
  });

  it('renders payment info when present', () => {
    expect(html).toContain('サンプル銀行');
    expect(html).toContain('普通');
  });

  it('renders multiline notes', () => {
    expect(html).toContain('お振込手数料');
  });

  it('renders signature area by default', () => {
    expect(html).toContain('seal-area');
  });

  it('omits signature area when option is false', () => {
    const without = renderInvoiceBody(standardInvoice(), { signatureArea: false });
    expect(without).not.toContain('seal-area');
  });
});

describe('renderInvoiceBody — mixed rate', () => {
  const html = renderInvoiceBody(mixedRateInvoice());

  it('marks reduced-rate items with ※', () => {
    expect(html).toContain('reduced-mark');
    expect(html).toContain('※');
  });

  it('shows both standard and reduced tax buckets', () => {
    expect(html).toContain('標準税率');
    expect(html).toContain('軽減税率');
    expect(html).toMatch(/300,000/);
    expect(html).toMatch(/4,800/);
  });

  it('omits the exempt row when its subtotal is zero', () => {
    expect(html).not.toContain('非課税');
  });

  it('omits payment section when paymentInfo is missing', () => {
    expect(html).not.toContain('お振込先');
  });
});

describe('renderInvoiceBody — empty row padding', () => {
  it('pads the items table up to 5 rows by default', () => {
    // standardInvoice() has 1 real item → 4 placeholder rows should follow.
    const html = renderInvoiceBody(standardInvoice());
    const emptyRowMatches = html.match(/<tr class="empty"/g) ?? [];
    expect(emptyRowMatches.length).toBe(4);
  });

  it('honors a custom minItemRows', () => {
    const html = renderInvoiceBody(standardInvoice(), { minItemRows: 8 });
    const emptyRowMatches = html.match(/<tr class="empty"/g) ?? [];
    expect(emptyRowMatches.length).toBe(7);
  });

  it('emits no placeholder rows when items already meet the minimum', () => {
    const html = renderInvoiceBody(standardInvoice(), { minItemRows: 1 });
    expect(html).not.toContain('<tr class="empty"');
  });

  it('emits no placeholder rows when minItemRows is zero', () => {
    const html = renderInvoiceBody(standardInvoice(), { minItemRows: 0 });
    expect(html).not.toContain('<tr class="empty"');
  });

  it('marks placeholder rows aria-hidden so screen readers skip them', () => {
    const html = renderInvoiceBody(standardInvoice());
    expect(html).toContain('aria-hidden="true"');
  });
});

describe('renderInvoiceBody — XSS safety', () => {
  const html = renderInvoiceBody(xssInvoice());

  it('escapes <script> tags from user fields', () => {
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('escapes attribute-style injections', () => {
    expect(html).not.toContain('<img src=x onerror');
    expect(html).toContain('&lt;img');
  });

  it('escapes quotation marks in recipient name', () => {
    expect(html).toContain('&quot;双方の顧客&quot;');
  });
});
