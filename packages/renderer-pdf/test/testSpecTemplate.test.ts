import { describe, it, expect } from 'vitest';
import { renderTestSpecBody } from '../src/testSpecTemplate.js';
import { standardTestSpec, minimalTestSpec } from './testSpecFixtures.js';

describe('renderTestSpecBody — cover page', () => {
  it('emits the document title, version, and issue date', () => {
    const html = renderTestSpecBody(standardTestSpec());
    expect(html).toContain('ログイン機能 検証シート');
    expect(html).toContain('TEST-2026-0001');
    expect(html).toContain('0.1.0');
    expect(html).toContain('2026年06月18日');
  });

  it('renders a status badge with the localized label for executing', () => {
    const html = renderTestSpecBody(standardTestSpec({ status: 'executing' }));
    expect(html).toContain('mdb-test-spec__status--executing');
    expect(html).toContain('実施中');
  });

  it('renders draft / review / completed badge variants', () => {
    expect(renderTestSpecBody(standardTestSpec({ status: 'draft' }))).toContain('ドラフト');
    expect(renderTestSpecBody(standardTestSpec({ status: 'review' }))).toContain('レビュー中');
    expect(renderTestSpecBody(standardTestSpec({ status: 'completed' }))).toContain('完了');
  });

  it('lists authors with their roles', () => {
    const html = renderTestSpecBody(standardTestSpec());
    expect(html).toContain('田中 雅友');
    expect(html).toContain('（PdM）');
    expect(html).toContain('山田 花子');
    expect(html).toContain('（QA リード）');
  });

  it('lists reviewers when provided', () => {
    const html = renderTestSpecBody(standardTestSpec());
    expect(html).toContain('佐藤 太郎');
    expect(html).toMatch(/レビュアー/);
  });

  it('omits the reviewers section when none are provided', () => {
    const html = renderTestSpecBody(minimalTestSpec());
    expect(html).not.toContain('レビュアー');
  });

  it('renders the related docs list when provided', () => {
    const html = renderTestSpecBody(standardTestSpec());
    expect(html).toContain('関連文書');
    expect(html).toContain('/docs/login-spec.md');
    expect(html).toContain('/docs/account-flow.md');
  });

  it('omits the related docs section when empty', () => {
    const html = renderTestSpecBody(standardTestSpec({ relatedDocs: [] }));
    expect(html).not.toContain('関連文書');
  });

  it('renders the googleSheetId reference when provided', () => {
    const html = renderTestSpecBody(standardTestSpec());
    expect(html).toContain('1abcDEF_sheetIdSample');
    expect(html).toMatch(/Google Sheets|シート/);
  });

  it('omits the googleSheetId reference when not provided', () => {
    const html = renderTestSpecBody(minimalTestSpec());
    expect(html).not.toContain('1abcDEF_sheetIdSample');
  });

  it('hides the cover page when hideCover is set', () => {
    const html = renderTestSpecBody(standardTestSpec(), { hideCover: true });
    expect(html).not.toContain('mdb-test-spec__cover');
    expect(html).not.toContain('mdb-test-spec__title');
  });
});

describe('renderTestSpecBody — columns section', () => {
  it('renders the columns definition table with each column name and type', () => {
    const html = renderTestSpecBody(standardTestSpec());
    expect(html).toContain('mdb-test-spec__columns');
    expect(html).toContain('項目');
    expect(html).toContain('手順');
    expect(html).toContain('結果');
    expect(html).toContain('実施日');
    expect(html).toContain('備考');
    // Type labels are Japanese (localized via dictionary)
    expect(html).toContain('文字列');
    expect(html).toContain('複数行');
    expect(html).toContain('プルダウン');
    expect(html).toContain('日付');
  });

  it('lists enum values for enum columns', () => {
    const html = renderTestSpecBody(standardTestSpec());
    expect(html).toContain('OK');
    expect(html).toContain('NG');
    expect(html).toContain('保留');
    expect(html).toContain('未実施');
  });

  it('annotates visual styles in human-readable form', () => {
    const html = renderTestSpecBody(standardTestSpec());
    // The fixture has visual: { NG: { row_background: ... }, 保留: { background: ... } }
    // The label format does not need to be strict, but should mention NG / 保留.
    expect(html).toMatch(/NG/);
    expect(html).toMatch(/保留/);
  });

  it('omits the columns section when no columns are defined (degenerate guard)', () => {
    // Schema enforces minItems:1, but the renderer should not crash on an
    // empty array if it ever slips through.
    const html = renderTestSpecBody(standardTestSpec({ columns: [] }));
    expect(html).not.toContain('mdb-test-spec__columns');
  });
});

describe('renderTestSpecBody — body injection', () => {
  it('wraps a pre-rendered HTML body in mdb-test-spec__body', () => {
    const html = renderTestSpecBody(standardTestSpec(), {
      bodyHtml: '<table><tr><td>1</td></tr></table>',
    });
    expect(html).toContain('mdb-test-spec__body');
    expect(html).toContain('<table><tr><td>1</td></tr></table>');
  });

  it('omits the body section when no bodyHtml is provided', () => {
    const html = renderTestSpecBody(standardTestSpec());
    expect(html).not.toContain('mdb-test-spec__body');
  });

  it('does NOT escape the bodyHtml (caller is responsible for sanitization)', () => {
    const body = '<p>inline <code>code</code></p>';
    const html = renderTestSpecBody(standardTestSpec(), { bodyHtml: body });
    expect(html).toContain(body);
  });
});

describe('renderTestSpecBody — theme color', () => {
  it('maps preset names to accent colors via CSS variable', () => {
    const html = renderTestSpecBody(standardTestSpec({ theme: 'red' }));
    expect(html).toContain('--mdb-color-accent:#b91c1c');
  });

  it('accepts custom hex colors', () => {
    const html = renderTestSpecBody(standardTestSpec({ theme: '#1e3a8a' }));
    expect(html).toContain('--mdb-color-accent:#1e3a8a');
  });

  it('ignores unknown theme strings (no style attribute injected)', () => {
    const html = renderTestSpecBody(standardTestSpec({ theme: 'magenta' }));
    expect(html).not.toContain('--mdb-color-accent');
  });

  it('handles missing theme gracefully', () => {
    const html = renderTestSpecBody(minimalTestSpec());
    expect(html).not.toContain('--mdb-color-accent');
  });

  it('rejects values that look like CSS injection attempts', () => {
    const html = renderTestSpecBody(standardTestSpec({ theme: 'red;background:url(evil)' }));
    expect(html).not.toContain('url(evil)');
    expect(html).not.toContain('--mdb-color-accent');
  });
});

describe('renderTestSpecBody — HTML safety', () => {
  it('escapes HTML special characters in title', () => {
    const html = renderTestSpecBody(standardTestSpec({ title: '<script>alert(1)</script>' }));
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('escapes author names', () => {
    const html = renderTestSpecBody(
      standardTestSpec({ authors: [{ name: '<img onerror=x>', role: '"><svg>' }] }),
    );
    expect(html).not.toContain('<img onerror=x>');
    expect(html).toContain('&lt;img onerror=x&gt;');
    expect(html).toContain('&quot;&gt;&lt;svg&gt;');
  });

  it('escapes the schema-version attribute', () => {
    const html = renderTestSpecBody(standardTestSpec());
    expect(html).toContain('data-schema-version="test-spec/v1"');
  });

  it('escapes column name special characters', () => {
    const html = renderTestSpecBody(
      standardTestSpec({ columns: [{ name: '<x>', type: 'text' }] }),
    );
    expect(html).not.toContain('<x>');
    expect(html).toContain('&lt;x&gt;');
  });
});
