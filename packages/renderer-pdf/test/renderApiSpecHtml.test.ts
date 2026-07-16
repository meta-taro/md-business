import { describe, it, expect } from 'vitest';
import { renderApiSpecHtml } from '../src/renderApiSpecHtml.js';
import { standardApiSpec } from './apiSpecFixtures.js';

describe('renderApiSpecHtml', () => {
  it('returns a full HTML document with doctype + ja lang', () => {
    const html = renderApiSpecHtml(standardApiSpec());
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('<html lang="ja">');
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain('<title>受発注システム API 設計書</title>');
    expect(html).toContain('mdb-api-spec');
  });

  it('respects a custom documentTitle and falls back to title otherwise', () => {
    expect(renderApiSpecHtml(standardApiSpec(), { documentTitle: '社外配布版' })).toContain(
      '<title>社外配布版</title>',
    );
    expect(renderApiSpecHtml(standardApiSpec({ title: '別タイトル' }))).toContain(
      '<title>別タイトル</title>',
    );
  });

  it('embeds inline styles / emits a stylesheet link', () => {
    const css = '.x { color: blue; }';
    expect(renderApiSpecHtml(standardApiSpec(), { embedStyles: css })).toContain(
      `<style>${css}</style>`,
    );
    expect(renderApiSpecHtml(standardApiSpec(), { stylesHref: '/api-spec.css' })).toContain(
      '<link rel="stylesheet" href="/api-spec.css">',
    );
  });

  it('escapes the stylesHref and document title (no script injection)', () => {
    const hrefHtml = renderApiSpecHtml(standardApiSpec(), { stylesHref: '"><script>x' });
    expect(hrefHtml).not.toContain('"><script>');
    expect(hrefHtml).toContain('&quot;&gt;&lt;script&gt;');
    const titleHtml = renderApiSpecHtml(standardApiSpec(), {
      documentTitle: '</title><script>',
    });
    expect(titleHtml).not.toContain('</title><script>');
    expect(titleHtml).toContain('&lt;/title&gt;&lt;script&gt;');
  });

  it('overrides the language attribute when lang is provided', () => {
    expect(renderApiSpecHtml(standardApiSpec(), { lang: 'en' })).toContain('<html lang="en">');
  });

  it('threads hideCover through to the body', () => {
    const html = renderApiSpecHtml(standardApiSpec(), { hideCover: true });
    expect(html).not.toContain('mdb-api-spec__cover');
  });
});
