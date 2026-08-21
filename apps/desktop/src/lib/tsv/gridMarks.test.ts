import { describe, it, expect } from 'vitest';
import type { IdentifiedTsv, ParsedHeader } from '@md-business/schema-test-spec-tsv';
import { isMarked, toggleMarks } from './gridMarks';

/**
 * 手で付けるセルの印（`#@ mark`）を、選択範囲で付け外しする。
 *
 * 赤字は前の版との突き合わせが出すのが本筋で、ここはその逃げ道（版がまだ無い / 値は同じ
 * だが意味が変わった）。逃げ道である以上、**外せる**ことが同じだけ大事になる。外し方が
 * 無いと、去年の赤字が残ったまま提出され続ける。
 *
 * 範囲の付け外しは表計算の太字と同じ流儀にする＝**全部付いていれば外す、そうでなければ
 * 付ける**。「1 つでも付いていたら外す」にすると、広く選んで一括で付ける操作ができない。
 */

function col(name: string): ParsedHeader {
  return { name, type: 'text', required: false } as ParsedHeader;
}

function id(n: number): string {
  return `r${String(n).padStart(12, '0')}`;
}

function doc(rows: number, directives: string[] = [], ids = true): IdentifiedTsv {
  return {
    formatId: 'md-business:test-spec-tsv/v1',
    meta: {},
    directives,
    columns: ['項目', '結果', '備考'].map(col),
    rows: Array.from({ length: rows }, () => ['', '', '']),
    rowIds: Array.from({ length: rows }, (_, i) => (ids ? id(i + 1) : '')),
    idColumn: '_id',
  } as IdentifiedTsv;
}

/** 左上→右下の包含境界。 */
const at = (r0: number, c0: number, r1: number, c1: number) => ({ r0, c0, r1, c1 });

describe('toggleMarks', () => {
  it('選んだ範囲に印を付ける', () => {
    expect(toggleMarks(doc(2), at(0, 1, 0, 2)).directives).toEqual([`mark ${id(1)} 結果,備考`]);
  });

  it('範囲が複数行なら行ごとに宣言を書く', () => {
    expect(toggleMarks(doc(2), at(0, 1, 1, 1)).directives).toEqual([
      `mark ${id(1)} 結果`,
      `mark ${id(2)} 結果`,
    ]);
  });

  it('全部に印が付いていれば外す', () => {
    const before = doc(1, [`mark ${id(1)} 結果,備考`]);
    expect(toggleMarks(before, at(0, 1, 0, 2)).directives).toEqual([]);
  });

  it('一部だけ付いていれば残りに付ける（外さない）', () => {
    const before = doc(1, [`mark ${id(1)} 結果`]);
    expect(toggleMarks(before, at(0, 1, 0, 2)).directives).toEqual([`mark ${id(1)} 結果,備考`]);
  });

  it('範囲の外の印は触らない', () => {
    const before = doc(2, [`mark ${id(2)} 備考`]);
    expect(toggleMarks(before, at(0, 1, 0, 1)).directives).toEqual([
      `mark ${id(2)} 備考`,
      `mark ${id(1)} 結果`,
    ]);
  });

  it('外した行の宣言だけが消える', () => {
    const before = doc(2, [`mark ${id(1)} 結果`, `mark ${id(2)} 結果`]);
    expect(toggleMarks(before, at(0, 1, 0, 1)).directives).toEqual([`mark ${id(2)} 結果`]);
  });

  it('表からはみ出した範囲は表の中だけ見る', () => {
    expect(toggleMarks(doc(1), at(0, 1, 5, 9)).directives).toEqual([`mark ${id(1)} 結果,備考`]);
  });

  it('行 ID が無ければ何も変えない（同じものを返す）', () => {
    const before = doc(1, [], false);
    expect(toggleMarks(before, at(0, 0, 0, 2))).toBe(before);
  });

  it('付けて外せば元の宣言に戻る', () => {
    const before = doc(2, ['rowid _id']);
    const marked = toggleMarks(before, at(0, 0, 1, 2));
    expect(toggleMarks(marked, at(0, 0, 1, 2)).directives).toEqual(['rowid _id']);
  });

  it('行と列は元のまま（印は見え方の話で、中身を触らない）', () => {
    const before = doc(2);
    const after = toggleMarks(before, at(0, 1, 0, 1));
    expect(after.rows).toEqual(before.rows);
    expect(after.rowIds).toEqual(before.rowIds);
  });
});

describe('isMarked', () => {
  const marks = new Map([[id(1), ['結果']]]);

  it('その行のその列に印があれば true', () => {
    expect(isMarked(marks, id(1), '結果')).toBe(true);
  });

  it('列が違えば false', () => {
    expect(isMarked(marks, id(1), '備考')).toBe(false);
  });

  it('行 ID も列名も無い場所は false', () => {
    expect(isMarked(marks, undefined, '結果')).toBe(false);
    expect(isMarked(marks, id(1), undefined)).toBe(false);
  });
});
