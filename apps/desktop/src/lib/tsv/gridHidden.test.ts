import { describe, it, expect } from 'vitest';
import { hideRow, hiddenRowCount, isHiddenRow, unhideRow } from './gridHidden';
import { ROW_ID_COLUMN, type IdentifiedTsv } from '@md-business/schema-test-spec-tsv';

/**
 * 控えにする／控えから戻す（DOM 非依存の純ロジック）。
 *
 * 控えは行 ID で指す。ここが行インデックスになると、1 行挿さった時点で別の行が控えになり、
 * 「消していいか毎回悩む」状態が悪化する。
 */

const A = 'raaaaaaaaaaaa';
const B = 'rbbbbbbbbbbbb';
const C = 'rcccccccccccc';

function makeDoc(directives: string[] = []): IdentifiedTsv {
  return {
    formatId: 'md-business:test-spec-tsv/v1',
    meta: {},
    directives,
    columns: [{ name: '項目', type: 'text', required: false }],
    rows: [['改訂'], ['初版'], ['ログアウト']],
    rowIds: [A, B, C],
    idColumn: ROW_ID_COLUMN,
  };
}

describe('hideRow', () => {
  it('その行の ID を控えの宣言に足す', () => {
    expect(hideRow(makeDoc(), 1).directives).toEqual([`hidden ${B}`]);
  });

  it('すでにある控えは残す', () => {
    expect(hideRow(makeDoc([`hidden ${C}`]), 1).directives).toEqual([`hidden ${C} ${B}`]);
  });

  it('控え以外のディレクティブは触らない', () => {
    expect(hideRow(makeDoc(['note 2026-08 実施', 'colwidth 0=240']), 1).directives).toEqual([
      'note 2026-08 実施',
      'colwidth 0=240',
      `hidden ${B}`,
    ]);
  });

  it('すでに控えの行は二重に足さない', () => {
    expect(hideRow(makeDoc([`hidden ${B}`]), 1).directives).toEqual([`hidden ${B}`]);
  });

  it('行の中身は動かさない', () => {
    const doc = makeDoc();

    expect(hideRow(doc, 1).rows).toEqual(doc.rows);
    expect(hideRow(doc, 1).rowIds).toEqual(doc.rowIds);
  });

  it('範囲外なら何もしない', () => {
    const doc = makeDoc();

    expect(hideRow(doc, 3)).toBe(doc);
    expect(hideRow(doc, -1)).toBe(doc);
  });
});

describe('unhideRow', () => {
  it('その行の ID を控えの宣言から外す', () => {
    expect(unhideRow(makeDoc([`hidden ${B} ${C}`]), 1).directives).toEqual([`hidden ${C}`]);
  });

  it('最後の 1 件を外すと宣言ごと消える', () => {
    expect(unhideRow(makeDoc(['note 2026-08 実施', `hidden ${B}`]), 1).directives).toEqual([
      'note 2026-08 実施',
    ]);
  });

  it('控えでない行なら何もしない', () => {
    const doc = makeDoc([`hidden ${B}`]);

    expect(unhideRow(doc, 0)).toBe(doc);
  });
});

describe('isHiddenRow', () => {
  it('控えとして宣言された行を見分ける', () => {
    const doc = makeDoc([`hidden ${B}`]);

    expect(isHiddenRow(doc, 1)).toBe(true);
    expect(isHiddenRow(doc, 0)).toBe(false);
  });

  it('範囲外は false', () => {
    expect(isHiddenRow(makeDoc([`hidden ${B}`]), 9)).toBe(false);
  });
});

describe('hiddenRowCount', () => {
  it('控えの件数を宣言から数える', () => {
    // 表から外れている状態でも数えられる（外したことに気づけるようにするため）。
    expect(hiddenRowCount(makeDoc([`hidden ${B} ${C}`]))).toBe(2);
    expect(hiddenRowCount(makeDoc())).toBe(0);
  });
});
