import { describe, expect, it } from 'vitest';
import { gridHtml } from '../src/grid/html.js';

const OPTIONS = {
  cspSource: 'vscode-webview://abc',
  nonce: 'n0nce',
  scriptUri: 'vscode-webview://abc/dist/tsvGrid.js',
};

describe('gridHtml', () => {
  it('lets only the nonce-tagged script run', () => {
    const html = gridHtml(OPTIONS);
    expect(html).toContain("default-src 'none'");
    expect(html).toContain("script-src 'nonce-n0nce'");
    expect(html).toContain(`<script nonce="n0nce" src="${OPTIONS.scriptUri}"></script>`);
  });

  it('follows the editor theme instead of fixing its own colours', () => {
    expect(gridHtml(OPTIONS)).toContain('var(--vscode-editor-background)');
  });

  it('escapes attribute values', () => {
    const html = gridHtml({ ...OPTIONS, scriptUri: 'x"><script>' });
    expect(html).not.toContain('x"><script>');
  });
});
