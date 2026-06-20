import { describe, it, expect } from 'vitest';
import { renderTestSpecHtml } from '../src/renderTestSpecHtml.js';
import { standardTestSpec } from './testSpecFixtures.js';

describe('renderTestSpecHtml', () => {
  it('returns a full HTML document with doctype + ja lang', () => {
    const html = renderTestSpecHtml(standardTestSpec());
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('<html lang="ja">');
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain('<title>ログイン機能 検証シート</title>');
    expect(html).toContain('mdb-test-spec');
  });

  it('respects a custom documentTitle', () => {
    const html = renderTestSpecHtml(standardTestSpec(), { documentTitle: '社外配布版' });
    expect(html).toContain('<title>社外配布版</title>');
  });

  it('falls back to spec.title when documentTitle is omitted', () => {
    const html = renderTestSpecHtml(standardTestSpec({ title: '別タイトル' }));
    expect(html).toContain('<title>別タイトル</title>');
  });

  it('embeds inline styles when embedStyles is provided', () => {
    const css = '.x { color: blue; }';
    const html = renderTestSpecHtml(standardTestSpec(), { embedStyles: css });
    expect(html).toContain(`<style>${css}</style>`);
  });

  it('emits a <link rel="stylesheet"> tag when stylesHref is provided', () => {
    const html = renderTestSpecHtml(standardTestSpec(), { stylesHref: '/test-spec.css' });
    expect(html).toContain('<link rel="stylesheet" href="/test-spec.css">');
  });

  it('escapes the stylesHref attribute (no script injection)', () => {
    const html = renderTestSpecHtml(standardTestSpec(), { stylesHref: '"><script>x' });
    expect(html).not.toContain('"><script>');
    expect(html).toContain('&quot;&gt;&lt;script&gt;');
  });

  it('overrides the language attribute when lang is provided', () => {
    const html = renderTestSpecHtml(standardTestSpec(), { lang: 'en' });
    expect(html).toContain('<html lang="en">');
  });

  it('escapes the document title', () => {
    const html = renderTestSpecHtml(standardTestSpec(), { documentTitle: '</title><script>' });
    expect(html).not.toContain('</title><script>');
    expect(html).toContain('&lt;/title&gt;&lt;script&gt;');
  });

  it('threads bodyHtml through to the test-spec body section', () => {
    const html = renderTestSpecHtml(standardTestSpec(), {
      bodyHtml: '<table><tr><td>検証行</td></tr></table>',
    });
    expect(html).toContain('mdb-test-spec__body');
    expect(html).toContain('<table><tr><td>検証行</td></tr></table>');
  });
});
