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

describe('renderInvoiceBody — item name |<size> suffix', () => {
  function makeWithName(name: string): Parameters<typeof renderInvoiceBody>[0] {
    const base = standardInvoice();
    return {
      ...base,
      items: [{ ...base.items[0]!, name }],
    };
  }

  it('strips a trailing |<px> suffix and inlines font-size on the name cell', () => {
    const html = renderInvoiceBody(makeWithName('高車点検改修人員配置|12px'));
    expect(html).toContain('style="font-size:12px"');
    expect(html).toContain('高車点検改修人員配置');
    expect(html).not.toContain('|12px');
  });

  it('supports pt and em suffixes', () => {
    expect(renderInvoiceBody(makeWithName('品目A|9pt'))).toContain('style="font-size:9pt"');
    expect(renderInvoiceBody(makeWithName('品目B|0.8em'))).toContain('style="font-size:0.8em"');
  });

  it('leaves the name untouched when the trailing token is not a size', () => {
    // Free-form "|" in a name (e.g., "前|後") must not be misread as a size.
    const html = renderInvoiceBody(makeWithName('前|後'));
    expect(html).toContain('前|後');
    expect(html).not.toContain('font-size:');
  });

  it('honors a backslash escape to keep a literal | next to a size-looking suffix', () => {
    const html = renderInvoiceBody(makeWithName('品目C\\|12px'));
    expect(html).toContain('品目C|12px');
    expect(html).not.toContain('font-size:');
  });

  it('emits no font-size attribute when no suffix is present', () => {
    const html = renderInvoiceBody(makeWithName('業務委託費'));
    expect(html).not.toContain('font-size:');
  });
});

describe('renderInvoiceBody — theme color', () => {
  it('emits no inline style attribute when no theme is set', () => {
    const html = renderInvoiceBody(standardInvoice());
    expect(html).not.toContain('--mdb-color-accent');
  });

  it('translates a preset name to a hex on the article element', () => {
    const html = renderInvoiceBody({ ...standardInvoice(), theme: 'red' });
    expect(html).toContain('style="--mdb-color-accent:#b91c1c"');
  });

  it('accepts each named preset', () => {
    const presets = ['blue', 'red', 'yellow', 'orange', 'purple', 'black', 'gray'];
    for (const name of presets) {
      const html = renderInvoiceBody({ ...standardInvoice(), theme: name });
      expect(html).toMatch(/--mdb-color-accent:#[0-9a-fA-F]{6}/);
    }
  });

  it('passes a literal #rrggbb through verbatim', () => {
    const html = renderInvoiceBody({ ...standardInvoice(), theme: '#ff8800' });
    expect(html).toContain('style="--mdb-color-accent:#ff8800"');
  });

  it('ignores unknown theme values rather than failing render', () => {
    const html = renderInvoiceBody({ ...standardInvoice(), theme: 'invalid-color' });
    expect(html).not.toContain('--mdb-color-accent');
  });

  it('refuses CSS injection via the theme field', () => {
    const html = renderInvoiceBody({
      ...standardInvoice(),
      theme: 'red; background:url(javascript:alert(1))',
    });
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('--mdb-color-accent');
  });
});

describe('renderInvoiceBody — logo', () => {
  const PNG_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABAQMAAAAl21bKAAAAA1BMVEUAAACnej3aAAAAAXRSTlMAQObYZgAAAApJREFUCNdjYAAAAAIAAeIhvDMAAAAASUVORK5CYII=';

  it('renders an <img> tag for an accepted data URL', () => {
    const html = renderInvoiceBody({ ...standardInvoice(), logo: PNG_DATA_URL });
    expect(html).toContain('class="mdb-invoice__logo"');
    expect(html).toContain(`src="${PNG_DATA_URL}"`);
  });

  it('renders an <img> tag for an https URL', () => {
    const html = renderInvoiceBody({
      ...standardInvoice(),
      logo: 'https://example.com/logo.png',
    });
    expect(html).toContain('src="https://example.com/logo.png"');
  });

  it('rejects javascript: URLs', () => {
    const html = renderInvoiceBody({
      ...standardInvoice(),
      logo: 'javascript:alert(1)',
    });
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('mdb-invoice__logo');
  });

  it('rejects data:image/svg+xml because it can carry script', () => {
    const html = renderInvoiceBody({
      ...standardInvoice(),
      logo: 'data:image/svg+xml;base64,PHN2Zy8+',
    });
    expect(html).not.toContain('mdb-invoice__logo');
  });

  it('rejects plain http URLs', () => {
    const html = renderInvoiceBody({
      ...standardInvoice(),
      logo: 'http://example.com/logo.png',
    });
    expect(html).not.toContain('mdb-invoice__logo');
  });

  it('omits the logo block when the field is absent', () => {
    const html = renderInvoiceBody(standardInvoice());
    expect(html).not.toContain('mdb-invoice__logo');
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
