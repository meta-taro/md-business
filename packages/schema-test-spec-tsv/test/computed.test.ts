import { describe, expect, it } from 'vitest';
import {
  applyComputed,
  computedCellValue,
  lockedColumns,
  readComputedColumns,
} from '../src/computed.js';
import type { TsvDocument } from '../src/parse.js';

/**
 * 計算列（`#@ computed <列名> = <式>`）。
 *
 * 最重要契約:
 * - **未知の式は宣言ごと捨てる**。塞いだのに値を出せないと、その列は編集不可のまま
 *   空で固定され、書く手段が消える。
 * - **算出値と一致していれば同じ参照を返す**。開いただけのファイルを変更扱いにしない。
 * - **区切りは `=`**。列名に空白を含められるようにするため（`#@ style` の空白区切りと違う）。
 */

/** テスト内で頻用する列並び（テンプレートの検証シートを縮めたもの）。 */
const COLUMNS = ['No.', '項目', '結果', 'ケース反映件数'];

function docOf(rows: string[][], columnNames: readonly string[] = COLUMNS): TsvDocument {
  return {
    formatId: 'md-business:test-spec-tsv/v1',
    meta: {},
    directives: [],
    columns: columnNames.map((name) => ({ name, type: 'text', required: false })),
    rows,
  } as unknown as TsvDocument;
}

describe('readComputedColumns', () => {
  it('列名と式を 1 本のルールへ読む', () => {
    expect(readComputedColumns(['computed No. = rowNumber()'], COLUMNS)).toEqual([
      { columnIndex: 0, formula: 'rowNumber' },
    ]);
  });

  it('computed 以外のディレクティブは無視する', () => {
    expect(
      readComputedColumns(['style 結果 OK=#cfc', 'note 補足', 'colwidth 0=240'], COLUMNS),
    ).toEqual([]);
  });

  it('列定義に無い列名を指す指定は捨てる', () => {
    expect(readComputedColumns(['computed 存在しない列 = rowNumber()'], COLUMNS)).toEqual([]);
  });

  it('= の前後の空白は詰める', () => {
    expect(readComputedColumns(['computed No.=rowNumber()'], COLUMNS)).toEqual([
      { columnIndex: 0, formula: 'rowNumber' },
    ]);
  });

  it('空白を含む列名を = で切り出せる', () => {
    expect(readComputedColumns(['computed ケース 反映 件数 = rowNumber()'], ['ケース 反映 件数'])).toEqual(
      [{ columnIndex: 0, formula: 'rowNumber' }],
    );
  });

  it('未知の式は捨てる（読めない列を編集不可のまま空で固定しない）', () => {
    expect(
      readComputedColumns(
        ['computed ケース反映件数 = countIn("07_観点表.tsv", "観点#", 観点#)'],
        COLUMNS,
      ),
    ).toEqual([]);
  });

  it('= が無い行は捨てる', () => {
    expect(readComputedColumns(['computed No. rowNumber()'], COLUMNS)).toEqual([]);
  });

  it('同じ列への重複宣言は後勝ちで 1 本に畳む', () => {
    expect(
      readComputedColumns(['computed No. = rowNumber()', 'computed No. = rowNumber()'], COLUMNS),
    ).toEqual([{ columnIndex: 0, formula: 'rowNumber' }]);
  });
});

describe('lockedColumns', () => {
  it('計算列の位置を集合で返す', () => {
    const locked = lockedColumns([{ columnIndex: 0, formula: 'rowNumber' }]);

    expect(locked.has(0)).toBe(true);
    expect(locked.has(1)).toBe(false);
  });
});

describe('computedCellValue', () => {
  it('rowNumber は 1 始まりの行番号', () => {
    expect(computedCellValue('rowNumber', 0)).toBe('1');
    expect(computedCellValue('rowNumber', 9)).toBe('10');
  });
});

describe('applyComputed', () => {
  it('計算列のセルを算出値で上書きする', () => {
    const doc = docOf([
      ['99', 'ログイン', 'OK', ''],
      ['', 'ログアウト', '', ''],
    ]);

    const next = applyComputed(doc, [{ columnIndex: 0, formula: 'rowNumber' }]);

    expect(next.rows[0]?.[0]).toBe('1');
    expect(next.rows[1]?.[0]).toBe('2');
  });

  it('計算列以外のセルは触らない', () => {
    const doc = docOf([['99', 'ログイン', 'OK', '']]);

    const next = applyComputed(doc, [{ columnIndex: 0, formula: 'rowNumber' }]);

    expect(next.rows[0]?.slice(1)).toEqual(['ログイン', 'OK', '']);
  });

  it('末尾が省略された短い行は計算列までパディングしてから書く', () => {
    const doc = docOf([['', '項目だけ']]);

    const next = applyComputed(doc, [{ columnIndex: 3, formula: 'rowNumber' }]);

    expect(next.rows[0]).toEqual(['', '項目だけ', '', '1']);
  });

  it('宣言が無ければ同じ参照をそのまま返す', () => {
    const doc = docOf([['1', 'ログイン', '', '']]);

    expect(applyComputed(doc, [])).toBe(doc);
  });

  it('既に算出値と一致していれば同じ参照をそのまま返す（開いただけで変更扱いにしない）', () => {
    const doc = docOf([
      ['1', 'ログイン', '', ''],
      ['2', 'ログアウト', '', ''],
    ]);

    expect(applyComputed(doc, [{ columnIndex: 0, formula: 'rowNumber' }])).toBe(doc);
  });

  it('入力を書き換えない', () => {
    const rows = [['99', 'ログイン', '', '']];

    applyComputed(docOf(rows), [{ columnIndex: 0, formula: 'rowNumber' }]);

    expect(rows[0]?.[0]).toBe('99');
  });

  it('列定義はそのまま持ち越す', () => {
    const doc = docOf([['99', 'ログイン', '', '']]);

    expect(applyComputed(doc, [{ columnIndex: 0, formula: 'rowNumber' }]).columns).toBe(doc.columns);
  });
});
