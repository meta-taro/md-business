import { describe, it, expect } from 'vitest';
import type { IdentifiedTsv, ParsedHeader } from '@md-business/schema-test-spec-tsv';
import { blankRow, appendRow, insertRowAfter, duplicateRow, deleteRow, clearRow } from './gridRows';

/**
 * 検証シートの行操作（追加 / 挿入 / 複製 / 削除）。QA がシートを組み立てるのに必須。
 * すべて不変（新ドキュメントを返す）。DOM 非依存で単体検査する。
 *
 * 行 ID は行と同じ並びで doc に載っているため、行数が変わる操作は ID の並びも
 * 一緒に動かす。ここを外すと、保存後に ID が別の行を指す。
 */

function col(name: string): ParsedHeader {
  return { name, type: 'text', required: false } as ParsedHeader;
}

/** 行 ID は `id(1)`, `id(2)`, … と読めるようにして、並びの検査を目視できる形にする。 */
function id(n: number): string {
  return `r${String(n).padStart(12, '0')}`;
}

/** 採番を検査可能にする差し替え用。既存行の ID と混ざらないよう 900 番台から振る。 */
function counter(): () => string {
  let n = 900;
  return () => id(++n);
}

function doc(cols: number, rows: string[][]): IdentifiedTsv {
  return {
    formatId: 'md-business:test-spec-tsv/v1',
    meta: {},
    directives: [],
    columns: Array.from({ length: cols }, (_, i) => col(`列${i + 1}`)),
    rows,
    rowIds: rows.map((_, i) => id(i + 1)),
    idColumn: '_id',
  } as IdentifiedTsv;
}

describe('blankRow', () => {
  it('列数ぶんの空セル', () => {
    expect(blankRow(doc(3, []))).toEqual(['', '', '']);
  });
});

describe('appendRow', () => {
  it('末尾に空行を足す（不変）', () => {
    const before = doc(2, [['a', 'b']]);
    const after = appendRow(before, counter());
    expect(after.rows).toEqual([
      ['a', 'b'],
      ['', ''],
    ]);
    expect(before.rows).toHaveLength(1);
  });

  it('足した行に ID を振る', () => {
    expect(appendRow(doc(1, [['a']]), counter()).rowIds).toEqual([id(1), id(901)]);
  });
});

describe('insertRowAfter', () => {
  it('指定行の直後に空行を挿入', () => {
    const after = insertRowAfter(doc(1, [['a'], ['b']]), 0, counter());
    expect(after.rows).toEqual([['a'], [''], ['b']]);
  });

  it('index が末尾以降なら末尾に足す', () => {
    const after = insertRowAfter(doc(1, [['a']]), 9, counter());
    expect(after.rows).toEqual([['a'], ['']]);
  });

  it('index が -1 なら先頭に挿入', () => {
    const after = insertRowAfter(doc(1, [['a']]), -1, counter());
    expect(after.rows).toEqual([[''], ['a']]);
  });

  it('挿入した位置に ID を差し込む（以降の行の ID はずらさない）', () => {
    // `No.` と違い ID は挿入で動かない。これが行を指せることの中身。
    const after = insertRowAfter(doc(1, [['a'], ['b']]), 0, counter());
    expect(after.rowIds).toEqual([id(1), id(901), id(2)]);
  });
});

describe('duplicateRow', () => {
  it('指定行の複製を直後に挿入（値は独立コピー）', () => {
    const before = doc(2, [['x', 'y']]);
    const after = duplicateRow(before, 0, counter());
    expect(after.rows).toEqual([
      ['x', 'y'],
      ['x', 'y'],
    ]);
    after.rows[1][0] = 'z'; // コピーは独立
    expect(after.rows[0][0]).toBe('x');
  });

  it('複製した行には元の ID を写さず、新しい ID を振る', () => {
    // 値は同じでも別の行。ID を写すと 2 行が同じものとして扱われる。
    expect(duplicateRow(doc(1, [['x']]), 0, counter()).rowIds).toEqual([id(1), id(901)]);
  });

  it('範囲外 index は変更しない', () => {
    const before = doc(1, [['a']]);
    expect(duplicateRow(before, 5, counter())).toBe(before);
  });
});

describe('deleteRow', () => {
  it('指定行を削除（不変）', () => {
    const before = doc(1, [['a'], ['b'], ['c']]);
    const after = deleteRow(before, 1);
    expect(after.rows).toEqual([['a'], ['c']]);
    expect(before.rows).toHaveLength(3);
  });

  it('消した行の ID だけ落とす', () => {
    expect(deleteRow(doc(1, [['a'], ['b'], ['c']]), 1).rowIds).toEqual([id(1), id(3)]);
  });

  it('範囲外 index は変更しない', () => {
    const before = doc(1, [['a']]);
    expect(deleteRow(before, 5)).toBe(before);
    expect(deleteRow(before, -1)).toBe(before);
  });
});

describe('clearRow', () => {
  it('指定行のセルを空にする（行は残す・不変）', () => {
    const before = doc(2, [
      ['a', 'b'],
      ['c', 'd'],
    ]);
    const after = clearRow(before, 0);
    expect(after.rows).toEqual([
      ['', ''],
      ['c', 'd'],
    ]);
    expect(before.rows[0]).toEqual(['a', 'b']);
  });

  it('中身を消しても行の ID は変わらない', () => {
    // 行は残る＝同じ行。書き直しただけで ID が変わると、レビューの往復で追えなくなる。
    expect(clearRow(doc(1, [['a'], ['b']]), 0).rowIds).toEqual([id(1), id(2)]);
  });

  it('範囲外 index は変更しない', () => {
    const before = doc(1, [['a']]);
    expect(clearRow(before, 5)).toBe(before);
  });
});
