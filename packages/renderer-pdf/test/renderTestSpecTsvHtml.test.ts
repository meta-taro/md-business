import { describe, it, expect } from 'vitest';
import { renderTestSpecTsvHtml } from '../src/renderTestSpecTsvHtml.js';
import { standardTsvSheet } from './testSpecTsvFixtures.js';

describe('renderTestSpecTsvHtml', () => {
  it('returns a full HTML document titled after the sheet', () => {
    const html = renderTestSpecTsvHtml(standardTsvSheet());
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('<html lang="ja">');
    expect(html).toContain('<title>デスクトップ v0.24.0 検証シート</title>');
    expect(html).toContain('mdb-tsv-sheet');
  });

  it('respects documentTitle and lang overrides', () => {
    const html = renderTestSpecTsvHtml(standardTsvSheet(), {
      documentTitle: '社外配布版',
      lang: 'en',
    });
    expect(html).toContain('<title>社外配布版</title>');
    expect(html).toContain('<html lang="en">');
  });

  it('embeds inline styles and escapes an external href', () => {
    expect(renderTestSpecTsvHtml(standardTsvSheet(), { embedStyles: '.x{}' })).toContain(
      '<style>.x{}</style>',
    );
    const html = renderTestSpecTsvHtml(standardTsvSheet(), { stylesHref: '"><script>x' });
    expect(html).not.toContain('"><script>');
    expect(html).toContain('&quot;&gt;&lt;script&gt;');
  });

  it('escapes the document title', () => {
    const html = renderTestSpecTsvHtml(standardTsvSheet(), { documentTitle: '</title><script>' });
    expect(html).not.toContain('</title><script>');
  });
});
