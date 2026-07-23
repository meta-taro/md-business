import { describe, it, expect } from 'vitest';
import type { ParsedHeader, TsvDocument } from '@md-business/schema-test-spec-tsv';
import { blankRow, appendRow, insertRowAfter, duplicateRow, deleteRow } from './gridRows';

/**
 * 検証シートの行操作（追加 / 挿入 / 複製 / 削除）。QA がシートを組み立てるのに必須。
 * すべて不変（新ドキュメントを返す）。DOM 非依存で単体検査する。
 */

function col(name: string): ParsedHeader {
  return { name, type: 'text', required: false } as ParsedHeader;
}

function doc(cols: number, rows: string[][]): TsvDocument {
  return {
    formatId: 'md-business:test-spec-tsv/v1',
    meta: {},
    directives: [],
    columns: Array.from({ length: cols }, (_, i) => col(`列${i + 1}`)),
    rows,
  } as TsvDocument;
}

describe('blankRow', () => {
  it('列数ぶんの空セル', () => {
    expect(blankRow(doc(3, []))).toEqual(['', '', '']);
  });
});

describe('appendRow', () => {
  it('末尾に空行を足す（不変）', () => {
    const before = doc(2, [['a', 'b']]);
    const after = appendRow(before);
    expect(after.rows).toEqual([
      ['a', 'b'],
      ['', ''],
    ]);
    expect(before.rows).toHaveLength(1);
  });
});

describe('insertRowAfter', () => {
  it('指定行の直後に空行を挿入', () => {
    const after = insertRowAfter(doc(1, [['a'], ['b']]), 0);
    expect(after.rows).toEqual([['a'], [''], ['b']]);
  });

  it('index が末尾以降なら末尾に足す', () => {
    const after = insertRowAfter(doc(1, [['a']]), 9);
    expect(after.rows).toEqual([['a'], ['']]);
  });

  it('index が -1 なら先頭に挿入', () => {
    const after = insertRowAfter(doc(1, [['a']]), -1);
    expect(after.rows).toEqual([[''], ['a']]);
  });
});

describe('duplicateRow', () => {
  it('指定行の複製を直後に挿入（値は独立コピー）', () => {
    const before = doc(2, [['x', 'y']]);
    const after = duplicateRow(before, 0);
    expect(after.rows).toEqual([
      ['x', 'y'],
      ['x', 'y'],
    ]);
    after.rows[1][0] = 'z'; // コピーは独立
    expect(after.rows[0][0]).toBe('x');
  });

  it('範囲外 index は変更しない', () => {
    const before = doc(1, [['a']]);
    expect(duplicateRow(before, 5)).toBe(before);
  });
});

describe('deleteRow', () => {
  it('指定行を削除（不変）', () => {
    const before = doc(1, [['a'], ['b'], ['c']]);
    const after = deleteRow(before, 1);
    expect(after.rows).toEqual([['a'], ['c']]);
    expect(before.rows).toHaveLength(3);
  });

  it('範囲外 index は変更しない', () => {
    const before = doc(1, [['a']]);
    expect(deleteRow(before, 5)).toBe(before);
    expect(deleteRow(before, -1)).toBe(before);
  });
});
