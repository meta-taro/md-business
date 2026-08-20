import { describe, it, expect } from 'vitest';
import type { TsvDocument } from '@md-business/schema-test-spec-tsv';
import { buildSearchRegex, DEFAULT_SEARCH_OPTIONS } from '../search/searchLogic';
import { findGridMatches, matchIndexFrom } from './gridSearch';

function doc(rows: string[][]): TsvDocument {
  const width = rows.reduce((max, row) => Math.max(max, row.length), 1);
  return {
    formatId: 'md-business:test-spec-tsv/v1',
    meta: {},
    directives: [],
    columns: Array.from({ length: width }, (_, i) => ({
      name: `c${i}`,
      type: 'text' as const,
      required: false,
    })),
    rows,
  };
}

function re(query: string, options: Partial<typeof DEFAULT_SEARCH_OPTIONS> = {}) {
  return buildSearchRegex(query, { ...DEFAULT_SEARCH_OPTIONS, ...options });
}

describe('findGridMatches', () => {
  it('当たったセルを上の行から左の列の順に返す', () => {
    const matches = findGridMatches(doc([['あ', 'か'], ['か', 'あ']]), re('か'));
    expect(matches).toEqual([
      { row: 0, col: 1 },
      { row: 1, col: 0 },
    ]);
  });

  it('1 つのセルに何度出てきても 1 件と数える', () => {
    const matches = findGridMatches(doc([['ここ']]), re('こ'));
    expect(matches).toEqual([{ row: 0, col: 0 }]);
  });

  it('検索できないとき（空のクエリ・不正な正規表現）は空', () => {
    expect(findGridMatches(doc([['あ']]), re(''))).toEqual([]);
    expect(findGridMatches(doc([['あ']]), re('[', { regex: true }))).toEqual([]);
  });

  it('大文字小文字を区別しないのが既定', () => {
    expect(findGridMatches(doc([['NG']]), re('ng'))).toHaveLength(1);
    expect(findGridMatches(doc([['NG']]), re('ng', { caseSensitive: true }))).toHaveLength(0);
  });

  it('セル内改行をまたいでも当たる', () => {
    expect(findGridMatches(doc([['1 行目\n2 行目']]), re('2 行目'))).toHaveLength(1);
  });

  it('列数に満たない行があっても落ちない', () => {
    const matches = findGridMatches(doc([['あ', 'か'], ['か']]), re('か'));
    expect(matches).toEqual([
      { row: 0, col: 1 },
      { row: 1, col: 0 },
    ]);
  });

  it('宣言より多い列が行に入っていても、見えている列までしか探さない', () => {
    const d = doc([['あ']]);
    d.rows[0] = ['あ', 'か'];
    expect(findGridMatches(d, re('か'))).toEqual([]);
  });

  it('空セルは当たらない', () => {
    expect(findGridMatches(doc([['', '']]), re('a'))).toEqual([]);
  });
});

describe('matchIndexFrom', () => {
  const matches = [
    { row: 1, col: 2 },
    { row: 3, col: 0 },
    { row: 3, col: 4 },
  ];

  it('今いるセル以降の最初の当たりを返す', () => {
    expect(matchIndexFrom(matches, { row: 0, col: 0 })).toBe(0);
    expect(matchIndexFrom(matches, { row: 2, col: 0 })).toBe(1);
    expect(matchIndexFrom(matches, { row: 3, col: 1 })).toBe(2);
  });

  it('今いるセル自身が当たっていればそれを返す', () => {
    expect(matchIndexFrom(matches, { row: 3, col: 0 })).toBe(1);
  });

  it('後ろに当たりが無ければ先頭へ回る', () => {
    expect(matchIndexFrom(matches, { row: 9, col: 0 })).toBe(0);
  });

  it('当たりが無ければ -1', () => {
    expect(matchIndexFrom([], { row: 0, col: 0 })).toBe(-1);
  });
});
