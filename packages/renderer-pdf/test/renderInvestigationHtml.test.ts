import { describe, it, expect } from 'vitest';
import { renderInvestigationHtml } from '../src/renderInvestigationHtml.js';
import { standardInvestigation } from './investigationFixtures.js';

describe('renderInvestigationHtml', () => {
  it('doctype と lang を備えた 1 枚の HTML を返す', () => {
    const html = renderInvestigationHtml(standardInvestigation());
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('<html lang="ja">');
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain('<title>決済 API の 502 増加についての調査</title>');
    expect(html).toContain('mdb-investigation');
  });

  it('documentTitle を指定できる。無ければ表題を使う', () => {
    expect(renderInvestigationHtml(standardInvestigation(), { documentTitle: '社外配布版' })).toContain(
      '<title>社外配布版</title>',
    );
    expect(renderInvestigationHtml(standardInvestigation({ title: '別の表題' }))).toContain(
      '<title>別の表題</title>',
    );
  });

  it('CSS は埋め込みと外部参照のどちらでも渡せる', () => {
    const css = '.x { color: blue; }';
    expect(renderInvestigationHtml(standardInvestigation(), { embedStyles: css })).toContain(
      `<style>${css}</style>`,
    );
    expect(
      renderInvestigationHtml(standardInvestigation(), { stylesHref: '/investigation.css' }),
    ).toContain('<link rel="stylesheet" href="/investigation.css">');
  });

  it('外部参照先と表題は素通ししない', () => {
    const hrefHtml = renderInvestigationHtml(standardInvestigation(), { stylesHref: '"><script>x' });
    expect(hrefHtml).not.toContain('"><script>');
    const titleHtml = renderInvestigationHtml(standardInvestigation(), {
      documentTitle: '</title><script>',
    });
    expect(titleHtml).not.toContain('</title><script>');
  });
});
