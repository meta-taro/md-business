import { describe, expect, it } from 'vitest';
import { createNonce, previewHtml } from '../src/preview/html.js';

const OPTIONS = {
  cspSource: 'vscode-webview://abc',
  nonce: 'n0nce',
  scriptUri: 'vscode-webview://abc/dist/preview.js',
  stylesBaseUri: 'vscode-webview://abc/dist/',
};

describe('previewHtml', () => {
  it('lets only the nonce-tagged script run', () => {
    const html = previewHtml(OPTIONS);
    expect(html).toContain("script-src 'nonce-n0nce'");
    expect(html).toContain(`<script nonce="n0nce" src="${OPTIONS.scriptUri}"></script>`);
    expect(html).toContain("default-src 'none'");
  });

  it('hands the styles base to the page script', () => {
    expect(previewHtml(OPTIONS)).toContain(`data-styles-base="${OPTIONS.stylesBaseUri}"`);
  });

  it('shows the document on white paper whatever the editor theme is', () => {
    const html = previewHtml(OPTIONS);
    expect(html).toContain('color-scheme: light');
    expect(html).toMatch(/#root\s*\{[^}]*background:\s*#fff/);
  });

  it('keeps the paper at A4 width instead of squeezing it into a narrow panel', () => {
    expect(previewHtml(OPTIONS)).toMatch(/#root\s*\{[^}]*width:\s*210mm/);
  });

  it('escapes attribute values', () => {
    const html = previewHtml({ ...OPTIONS, stylesBaseUri: 'x"><script>' });
    expect(html).not.toContain('x"><script>');
    expect(html).toContain('x&quot;&gt;&lt;script&gt;');
  });
});

describe('createNonce', () => {
  it('returns a fresh alphanumeric value each time', () => {
    const a = createNonce();
    expect(a).toMatch(/^[A-Za-z0-9]{32}$/);
    expect(createNonce()).not.toBe(a);
  });
});
