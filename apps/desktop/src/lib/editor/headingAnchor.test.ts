import { describe, expect, it } from 'vitest';
import { findHeadingOffset } from './headingAnchor';

describe('findHeadingOffset', () => {
  const doc = ['# 受注管理', '', '本文', '', '## 受注の登録', '', '手順を書く', ''].join('\n');

  it('見出しの文字列で位置を引く', () => {
    expect(findHeadingOffset(doc, '受注の登録')).toBe(doc.indexOf('## 受注の登録'));
  });

  it('先頭の見出しも引ける', () => {
    expect(findHeadingOffset(doc, '受注管理')).toBe(0);
  });

  it('段数は問わない', () => {
    const deep = ['###### 付録', ''].join('\n');
    expect(findHeadingOffset(deep, '付録')).toBe(0);
  });

  // 見出し行の末尾に `#` を付ける書き方がある。書いた人は見出しの文字だけを指したい。
  it('閉じの # は見出しの一部として数えない', () => {
    const closed = ['## まとめ ##', ''].join('\n');
    expect(findHeadingOffset(closed, 'まとめ')).toBe(0);
  });

  it('前後の空白は無視する', () => {
    expect(findHeadingOffset(doc, '  受注の登録 ')).toBe(doc.indexOf('## 受注の登録'));
  });

  // 手順書にはコマンド例が入る。``` の中の `# …` はコメントであって見出しではない。
  it('コードブロックの中は見出しにしない', () => {
    const fenced = ['```sh', '# 受注の登録', '```', '', '## 受注の登録', ''].join('\n');
    expect(findHeadingOffset(fenced, '受注の登録')).toBe(fenced.indexOf('## 受注の登録'));
  });

  it('同じ見出しが複数あれば最初を返す', () => {
    const twice = ['## 補足', '', 'あ', '', '## 補足', ''].join('\n');
    expect(findHeadingOffset(twice, '補足')).toBe(0);
  });

  it('見つからなければ null', () => {
    expect(findHeadingOffset(doc, '出荷')).toBeNull();
    expect(findHeadingOffset(doc, '')).toBeNull();
    // 本文に同じ文字列があっても、見出しでなければ指せない。
    expect(findHeadingOffset(doc, '本文')).toBeNull();
  });

  // `#見出し` は見出しではない（記法として空白が要る）。
  it('# の後ろに空白が無ければ見出しにしない', () => {
    expect(findHeadingOffset(['#受注', ''].join('\n'), '受注')).toBeNull();
  });
});
