import { describe, it, expect } from 'vitest';
import { renderNosqlDbSpecHtml } from '../src/renderNosqlDbSpecHtml.js';
import { standardNosqlDbSpec } from './nosqlDbSpecFixtures.js';

describe('renderNosqlDbSpecHtml', () => {
  it('returns a full HTML document with doctype + ja lang', () => {
    const html = renderNosqlDbSpecHtml(standardNosqlDbSpec());
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('<html lang="ja">');
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain('<title>受発注システム NoSQL 設計書</title>');
    expect(html).toContain('mdb-nosql-db-spec');
  });

  it('respects a custom documentTitle and falls back to title otherwise', () => {
    expect(renderNosqlDbSpecHtml(standardNosqlDbSpec(), { documentTitle: '社外配布版' })).toContain(
      '<title>社外配布版</title>',
    );
    expect(renderNosqlDbSpecHtml(standardNosqlDbSpec({ title: '別タイトル' }))).toContain(
      '<title>別タイトル</title>',
    );
  });

  it('embeds inline styles / emits a stylesheet link', () => {
    const css = '.x { color: blue; }';
    expect(renderNosqlDbSpecHtml(standardNosqlDbSpec(), { embedStyles: css })).toContain(
      `<style>${css}</style>`,
    );
    expect(renderNosqlDbSpecHtml(standardNosqlDbSpec(), { stylesHref: '/nosql-db-spec.css' })).toContain(
      '<link rel="stylesheet" href="/nosql-db-spec.css">',
    );
  });

  it('escapes the stylesHref and document title (no script injection)', () => {
    const hrefHtml = renderNosqlDbSpecHtml(standardNosqlDbSpec(), { stylesHref: '"><script>x' });
    expect(hrefHtml).not.toContain('"><script>');
    expect(hrefHtml).toContain('&quot;&gt;&lt;script&gt;');
    const titleHtml = renderNosqlDbSpecHtml(standardNosqlDbSpec(), {
      documentTitle: '</title><script>',
    });
    expect(titleHtml).not.toContain('</title><script>');
    expect(titleHtml).toContain('&lt;/title&gt;&lt;script&gt;');
  });

  it('overrides the language attribute when lang is provided', () => {
    expect(renderNosqlDbSpecHtml(standardNosqlDbSpec(), { lang: 'en' })).toContain(
      '<html lang="en">',
    );
  });

  it('threads hideCover through to the body', () => {
    const html = renderNosqlDbSpecHtml(standardNosqlDbSpec(), { hideCover: true });
    expect(html).not.toContain('mdb-nosql-db-spec__cover');
  });
});
