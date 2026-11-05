import { describe, it, expect } from 'vitest';
import {
  acceptRevisions,
  hasRevisionMarks,
  findRevisionMarks,
  revisionHistoryWarnings,
  renderMarkdownToHtml,
} from '../src/index.js';

describe('findRevisionMarks', () => {
  it('追加・削除・置換の 3 種を拾う', () => {
    const marks = findRevisionMarks('a{++足す++}b{--消す--}c{~~前~>後~~}d');
    expect(marks.map((m) => m.kind)).toEqual(['insert', 'delete', 'substitute']);
    expect(marks[2]).toMatchObject({ before: '前', after: '後' });
  });

  it('コードの中は印として扱わない', () => {
    expect(hasRevisionMarks('`{++x++}`')).toBe(false);
    expect(hasRevisionMarks('```\n{--x--}\n```\n')).toBe(false);
    expect(hasRevisionMarks('本文 {++x++}')).toBe(true);
  });

  it('空行をまたぐものは印にしない（段落を越えた閉じ忘れで後ろが崩れないように）', () => {
    expect(hasRevisionMarks('{++a\n\nb++}')).toBe(false);
  });
});

describe('acceptRevisions（清書）', () => {
  it('追加は残し、削除は消し、置換は後ろを採る', () => {
    expect(acceptRevisions('a{++足す++}b{--消す--}c{~~前~>後~~}d')).toBe('a足すbc後d');
  });

  it('コードの中はそのまま', () => {
    expect(acceptRevisions('`{--x--}` {--y--}')).toBe('`{--x--}` ');
  });
});

describe('renderMarkdownToHtml の revisions', () => {
  const src = '文は{++新しく++}{--古く--}{~~前~>後~~}なる。';

  it('既定は印を見せる', () => {
    const html = renderMarkdownToHtml(src, { hasFrontmatter: false });
    expect(html).toContain('<ins class="mdb-ins">新しく</ins>');
    expect(html).toContain('<del class="mdb-del">古く</del>');
    expect(html).toContain('<del class="mdb-del">前</del><ins class="mdb-ins">後</ins>');
    // 印のある段落には余白の縦線を引くための印を付ける
    expect(html).toContain('<p class="mdb-changed">');
  });

  it('印の中の強調も崩さない', () => {
    const html = renderMarkdownToHtml('{++**太字**++}', { hasFrontmatter: false });
    expect(html).toContain('<ins class="mdb-ins"><strong>太字</strong></ins>');
  });

  it('清書は印を外す', () => {
    const html = renderMarkdownToHtml(src, { hasFrontmatter: false, revisions: 'clean' });
    expect(html).toBe('<p>文は新しく後なる。</p>');
  });

  it('提出版でも印は版と別に選べる', () => {
    const html = renderMarkdownToHtml(src, { hasFrontmatter: false, edition: 'submission' });
    expect(html).toContain('mdb-ins');
  });
});

describe('revisionHistoryWarnings', () => {
  const body = (rows: string[]) =>
    ['# 改版履歴', '', '| 版 | 日付 | 内容 |', '|---|---|---|', ...rows, '', '# 1. 概要'].join('\n');

  it('版が履歴にあれば何も言わない', () => {
    expect(revisionHistoryWarnings({ 版: '0.3.0' }, body(['| 0.2.0 | 2026-06-01 | 初版 |', '| 0.3.0 | 2026-06-17 | 追記 |']))).toEqual([]);
  });

  it('版を上げたのに履歴に行が無ければ知らせる', () => {
    const out = revisionHistoryWarnings({ version: '0.4.0' }, body(['| 0.3.0 | 2026-06-17 | 追記 |']));
    expect(out).toHaveLength(1);
    expect(out[0]).toContain('0.4.0');
    expect(out[0]).toContain('改版履歴');
  });

  it('v 付き・空白違いは同じ版とみなす', () => {
    expect(revisionHistoryWarnings({ version: '1.0.0' }, body(['| v1.0.0 | 2026-07-01 | 確定 |']))).toEqual([]);
  });

  it('英語の見出し・列名でも読む', () => {
    const b = ['## Revision History', '', '| Version | Date |', '|---|---|', '| 1.0.0 | 2026-07-01 |'].join('\n');
    expect(revisionHistoryWarnings({ version: '1.0.1' }, b)).toHaveLength(1);
  });

  it('履歴の表が無い文書・版の無い文書には何も言わない', () => {
    expect(revisionHistoryWarnings({ version: '1.0.0' }, '# 概要\n\n本文')).toEqual([]);
    expect(revisionHistoryWarnings({}, body(['| 0.3.0 | x | y |']))).toEqual([]);
  });

  it('コードブロックの中の表は履歴として読まない', () => {
    const b = ['```', '# 改版履歴', '| 版 |', '|---|', '| 0.1.0 |', '```'].join('\n');
    expect(revisionHistoryWarnings({ version: '9.9.9' }, b)).toEqual([]);
  });
});
