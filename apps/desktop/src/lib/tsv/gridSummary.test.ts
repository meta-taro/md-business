import { describe, it, expect } from 'vitest';
import type { TsvDocument } from '@md-business/schema-test-spec-tsv';
import { summarizeRange, formatSummaryValue } from './gridSummary';
import type { CellRange } from './gridRange';

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

/** 左上 (r0,c0) から右下 (r1,c1) までの範囲。 */
function range(r0: number, c0: number, r1: number, c1: number): CellRange {
  return { anchor: { row: r0, col: c0 }, focus: { row: r1, col: c1 } };
}

describe('summarizeRange', () => {
  it('数として読めるセルが 2 つ未満なら出さない', () => {
    expect(summarizeRange(doc([['1'], ['あ']]), range(0, 0, 1, 0))).toBeNull();
    expect(summarizeRange(doc([['あ'], ['い']]), range(0, 0, 1, 0))).toBeNull();
  });

  it('件数・合計・平均・最小・最大を返す', () => {
    const summary = summarizeRange(doc([['10'], ['20'], ['30']]), range(0, 0, 2, 0));
    expect(summary).toEqual({ count: 3, sum: 60, average: 20, min: 10, max: 30 });
  });

  it('空セルと文字は数えない（平均の分母にも入れない）', () => {
    const summary = summarizeRange(doc([['10'], [''], ['小計'], ['30']]), range(0, 0, 3, 0));
    expect(summary).toEqual({ count: 2, sum: 40, average: 20, min: 10, max: 30 });
  });

  it('桁区切りのカンマを落として読む', () => {
    const summary = summarizeRange(doc([['1,200'], ['3,800']]), range(0, 0, 1, 0));
    expect(summary?.sum).toBe(5000);
  });

  it('小数を足しても誤差が出ない', () => {
    const summary = summarizeRange(doc([['0.1'], ['0.2']]), range(0, 0, 1, 0));
    expect(summary?.sum).toBe(0.3);
  });

  it('負の数を扱える', () => {
    const summary = summarizeRange(doc([['-500'], ['1500']]), range(0, 0, 1, 0));
    expect(summary).toEqual({ count: 2, sum: 1000, average: 500, min: -500, max: 1500 });
  });

  it('複数の列にまたがって数える', () => {
    const summary = summarizeRange(doc([['1', '2'], ['3', '4']]), range(0, 0, 1, 1));
    expect(summary).toEqual({ count: 4, sum: 10, average: 2.5, min: 1, max: 4 });
  });

  it('選んだ範囲の外は数えない', () => {
    const summary = summarizeRange(doc([['1', '999'], ['3', '999']]), range(0, 0, 1, 0));
    expect(summary).toEqual({ count: 2, sum: 4, average: 2, min: 1, max: 3 });
  });

  it('データより下の余白行は数えない（範囲が下へはみ出しても落ちない）', () => {
    const summary = summarizeRange(doc([['10'], ['20']]), range(0, 0, 40, 0));
    expect(summary).toEqual({ count: 2, sum: 30, average: 15, min: 10, max: 20 });
  });

  it('列数に満たない行があっても落ちない', () => {
    const summary = summarizeRange(doc([['10', '5'], ['20']]), range(0, 0, 1, 1));
    expect(summary?.count).toBe(3);
    expect(summary?.sum).toBe(35);
  });

  it('桁が大きすぎて整数へ寄せられない小数でも合計を出す', () => {
    const summary = summarizeRange(
      doc([['1.00000000000001'], ['2.00000000000001']]),
      range(0, 0, 1, 0),
    );
    expect(summary?.count).toBe(2);
    expect(summary?.sum).toBeCloseTo(3, 8);
  });

  it('指数表記は数として読まない（列の型が受け付けない書き方に合わせる）', () => {
    expect(summarizeRange(doc([['1e3'], ['2e3']]), range(0, 0, 1, 0))).toBeNull();
  });
});

describe('formatSummaryValue', () => {
  it('桁区切りを入れる', () => {
    expect(formatSummaryValue(1234567, 'en')).toBe('1,234,567');
  });

  it('小数は必要な桁だけ残す', () => {
    expect(formatSummaryValue(2.5, 'en')).toBe('2.5');
    expect(formatSummaryValue(20, 'en')).toBe('20');
  });

  it('割り切れない平均は丸めて出す（桁を垂れ流さない）', () => {
    expect(formatSummaryValue(1 / 3, 'en')).toBe('0.333');
  });

  it('知らない表示言語でも落ちない', () => {
    expect(formatSummaryValue(1000, 'zz-ZZ')).toContain('1');
  });
});
