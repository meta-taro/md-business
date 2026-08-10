import { describe, expect, it } from 'vitest';
import { findRowsByCell, parseCellLink } from '../src/link.js';
import { parseTsv } from '../src/parse.js';

describe('parseCellLink — 外部', () => {
  it('http / https / mailto はそのまま外部として扱う', () => {
    expect(parseCellLink('https://example.com/a?b=1#c')).toEqual({
      kind: 'external',
      href: 'https://example.com/a?b=1#c',
    });
    expect(parseCellLink('http://example.com')).toEqual({
      kind: 'external',
      href: 'http://example.com',
    });
    expect(parseCellLink('mailto:info@example.com')).toEqual({
      kind: 'external',
      href: 'mailto:info@example.com',
    });
  });

  // 開ける相手を絞る。セルの値はファイルから来るので、開く前にここで落とす。
  it('http / https / mailto 以外のスキームは受け付けない', () => {
    expect(parseCellLink('javascript:alert(1)')).toBeNull();
    expect(parseCellLink('JavaScript:alert(1)')).toBeNull();
    expect(parseCellLink('data:text/html,<b>x</b>')).toBeNull();
    expect(parseCellLink('file:///etc/passwd')).toBeNull();
  });
});

describe('parseCellLink — 同じシートの行', () => {
  it('パスを省くと同じシートの行を指す', () => {
    expect(parseCellLink('#項目=TC-012')).toEqual({
      kind: 'row',
      path: null,
      column: '項目',
      value: 'TC-012',
    });
  });

  // 値に = を含められるようにする。
  it('= は最初の 1 個で区切る', () => {
    expect(parseCellLink('#式=a=b')).toEqual({
      kind: 'row',
      path: null,
      column: '式',
      value: 'a=b',
    });
  });

  it('列名を書いていなければ行の指定として受け付けない', () => {
    expect(parseCellLink('#TC-012')).toBeNull();
  });

  it('列名または値が空なら受け付けない', () => {
    expect(parseCellLink('#=TC-012')).toBeNull();
    expect(parseCellLink('#項目=')).toBeNull();
  });
});

describe('parseCellLink — 別のファイル', () => {
  it('.tsv は 列名=値 で行を指す', () => {
    expect(parseCellLink('docs/test-specs/001-login.tsv#項目=TC-012')).toEqual({
      kind: 'row',
      path: 'docs/test-specs/001-login.tsv',
      column: '項目',
      value: 'TC-012',
    });
  });

  it('.md は見出しの文字列を指す', () => {
    expect(parseCellLink('docs/specs/order.md#受注の登録')).toEqual({
      kind: 'heading',
      path: 'docs/specs/order.md',
      heading: '受注の登録',
    });
  });

  it('指し先を書かなければファイルを開くだけ', () => {
    expect(parseCellLink('docs/specs/order.md')).toEqual({
      kind: 'file',
      path: 'docs/specs/order.md',
    });
    expect(parseCellLink('docs/test-specs/001-login.tsv')).toEqual({
      kind: 'file',
      path: 'docs/test-specs/001-login.tsv',
    });
  });

  it('上の階層へ戻る相対パスも指せる', () => {
    expect(parseCellLink('../specs/order.md#受注の登録')).toEqual({
      kind: 'heading',
      path: '../specs/order.md',
      heading: '受注の登録',
    });
  });

  // Windows で入力すると区切りが \ になる。書いた本人の環境でだけ動く形にしない。
  it('区切りの \\ は / に直して読む', () => {
    expect(parseCellLink('docs\\specs\\order.md')).toEqual({
      kind: 'file',
      path: 'docs/specs/order.md',
    });
  });

  // 絶対パスは書いた本人の PC でしか開けない。共有した時点で壊れているので受け付けない。
  it('絶対パスは受け付けない', () => {
    expect(parseCellLink('/docs/specs/order.md')).toBeNull();
    expect(parseCellLink('C:/docs/specs/order.md')).toBeNull();
    expect(parseCellLink('C:\\docs\\specs\\order.md')).toBeNull();
    expect(parseCellLink('//server/share/order.md')).toBeNull();
  });

  it('.tsv の指し先に 列名=値 の形でないものを書いたら受け付けない', () => {
    expect(parseCellLink('docs/test-specs/001-login.tsv#TC-012')).toBeNull();
  });

  // 開ける形式だけを参照として認める。これが無いと、ただの覚え書きが
  // 「開けないファイルへのリンク」に化けてクリックできてしまう。
  it('.tsv / .md 以外は参照として受け付けない', () => {
    expect(parseCellLink('参照メモ')).toBeNull();
    expect(parseCellLink('docs/notes.txt')).toBeNull();
    expect(parseCellLink('あとで確認する #項目=TC-012')).toBeNull();
  });
});

describe('parseCellLink — リンクでないもの', () => {
  it('空・空白だけ・# だけは null', () => {
    expect(parseCellLink('')).toBeNull();
    expect(parseCellLink('   ')).toBeNull();
    expect(parseCellLink('#')).toBeNull();
  });

  it('前後の空白は落として読む', () => {
    expect(parseCellLink('  https://example.com  ')).toEqual({
      kind: 'external',
      href: 'https://example.com',
    });
  });
});

const SHEET = [
  '#! md-business:test-spec-tsv/v1',
  '# タイトル: リンク先',
  '項目\t結果:enum(OK|NG)',
  'TC-011\tOK',
  'TC-012\tNG',
  'TC-012\t',
].join('\n');

describe('findRowsByCell', () => {
  const doc = parseTsv(SHEET);

  it('値が一致する行を上から順に返す', () => {
    expect(findRowsByCell(doc, '項目', 'TC-011')).toEqual({ column: 0, rows: [0] });
  });

  it('同じ値が複数あれば全部返す（呼び出し側が最初へ移動して件数を知らせる）', () => {
    expect(findRowsByCell(doc, '項目', 'TC-012')).toEqual({ column: 0, rows: [1, 2] });
  });

  it('一致しなければ行は空', () => {
    expect(findRowsByCell(doc, '項目', 'TC-999')).toEqual({ column: 0, rows: [] });
  });

  // 「列が無い」と「値が無い」は知らせ方が変わるので、呼び出し側が区別できるようにする。
  it('列が無ければ column は -1', () => {
    expect(findRowsByCell(doc, '存在しない列', 'TC-011')).toEqual({ column: -1, rows: [] });
  });

  it('前後の空白は無視して突き合わせる', () => {
    expect(findRowsByCell(doc, ' 項目 ', ' TC-011 ')).toEqual({ column: 0, rows: [0] });
  });
});
