import { describe, it, expect } from 'vitest';
import { renderDbSpecHtml } from '../src/renderDbSpecHtml.js';
import { standardDbSpec } from './dbSpecFixtures.js';

describe('renderDbSpecHtml', () => {
  it('returns a full HTML document with doctype + ja lang', () => {
    const html = renderDbSpecHtml(standardDbSpec());
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('<html lang="ja">');
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain('<title>受発注システム DB 設計書</title>');
    expect(html).toContain('mdb-db-spec');
  });

  it('respects a custom documentTitle and falls back to title otherwise', () => {
    expect(renderDbSpecHtml(standardDbSpec(), { documentTitle: '社外配布版' })).toContain(
      '<title>社外配布版</title>',
    );
    expect(renderDbSpecHtml(standardDbSpec({ title: '別タイトル' }))).toContain(
      '<title>別タイトル</title>',
    );
  });

  it('embeds inline styles / emits a stylesheet link', () => {
    const css = '.x { color: blue; }';
    expect(renderDbSpecHtml(standardDbSpec(), { embedStyles: css })).toContain(
      `<style>${css}</style>`,
    );
    expect(renderDbSpecHtml(standardDbSpec(), { stylesHref: '/db-spec.css' })).toContain(
      '<link rel="stylesheet" href="/db-spec.css">',
    );
  });

  it('escapes the stylesHref and document title (no script injection)', () => {
    const hrefHtml = renderDbSpecHtml(standardDbSpec(), { stylesHref: '"><script>x' });
    expect(hrefHtml).not.toContain('"><script>');
    expect(hrefHtml).toContain('&quot;&gt;&lt;script&gt;');
    const titleHtml = renderDbSpecHtml(standardDbSpec(), { documentTitle: '</title><script>' });
    expect(titleHtml).not.toContain('</title><script>');
    expect(titleHtml).toContain('&lt;/title&gt;&lt;script&gt;');
  });

  it('overrides the language attribute when lang is provided', () => {
    expect(renderDbSpecHtml(standardDbSpec(), { lang: 'en' })).toContain('<html lang="en">');
  });

  it('threads hideCover through to the body', () => {
    const html = renderDbSpecHtml(standardDbSpec(), { hideCover: true });
    expect(html).not.toContain('mdb-db-spec__cover');
  });
});
