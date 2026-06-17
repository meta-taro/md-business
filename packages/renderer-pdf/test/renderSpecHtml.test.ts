import { describe, it, expect } from 'vitest';
import { renderSpecHtml } from '../src/renderSpecHtml.js';
import { standardSpec } from './specFixtures.js';

describe('renderSpecHtml', () => {
  it('returns a full HTML document with doctype + ja lang', () => {
    const html = renderSpecHtml(standardSpec());
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('<html lang="ja">');
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain('<title>受発注システム 基本設計書</title>');
    expect(html).toContain('mdb-spec');
  });

  it('respects a custom documentTitle', () => {
    const html = renderSpecHtml(standardSpec(), { documentTitle: '社外配布版' });
    expect(html).toContain('<title>社外配布版</title>');
  });

  it('falls back to spec.title when documentTitle is omitted', () => {
    const html = renderSpecHtml(standardSpec({ title: '別タイトル' }));
    expect(html).toContain('<title>別タイトル</title>');
  });

  it('embeds inline styles when embedStyles is provided', () => {
    const css = '.x { color: blue; }';
    const html = renderSpecHtml(standardSpec(), { embedStyles: css });
    expect(html).toContain(`<style>${css}</style>`);
  });

  it('emits a <link rel="stylesheet"> tag when stylesHref is provided', () => {
    const html = renderSpecHtml(standardSpec(), { stylesHref: '/spec.css' });
    expect(html).toContain('<link rel="stylesheet" href="/spec.css">');
  });

  it('escapes the stylesHref attribute (no script injection)', () => {
    const html = renderSpecHtml(standardSpec(), { stylesHref: '"><script>x' });
    expect(html).not.toContain('"><script>');
    expect(html).toContain('&quot;&gt;&lt;script&gt;');
  });

  it('overrides the language attribute when lang is provided', () => {
    const html = renderSpecHtml(standardSpec(), { lang: 'en' });
    expect(html).toContain('<html lang="en">');
  });

  it('escapes the document title', () => {
    const html = renderSpecHtml(standardSpec(), { documentTitle: '</title><script>' });
    expect(html).not.toContain('</title><script>');
    expect(html).toContain('&lt;/title&gt;&lt;script&gt;');
  });

  it('threads bodyHtml through to the spec body section', () => {
    const html = renderSpecHtml(standardSpec(), { bodyHtml: '<p>本文セクション</p>' });
    expect(html).toContain('mdb-spec__body');
    expect(html).toContain('<p>本文セクション</p>');
  });
});
