import { describe, it, expect } from 'vitest';
import { filterModeOf, sortSpecFor, valueChoicesOf } from './gridColumnMenu';
import type { CellWidget } from './gridModel';

describe('sortSpecFor — 列の型で比べ方を決める', () => {
  it('数の列は数として比べる', () => {
    expect(sortSpecFor(2, 'asc', { kind: 'number', required: false })).toEqual({ col: 2, dir: 'asc', kind: 'number' });
  });

  it('日付と日時の列は日付として比べる', () => {
    expect(sortSpecFor(0, 'desc', { kind: 'date', required: false }).kind).toBe('date');
    expect(sortSpecFor(0, 'desc', { kind: 'datetime', required: false }).kind).toBe('date');
  });

  it('選択肢の列は選択肢の並び順で比べる', () => {
    expect(sortSpecFor(1, 'asc', { kind: 'select', options: ['未実施', 'OK'], required: false })).toEqual({
      col: 1,
      dir: 'asc',
      kind: 'enum',
      options: ['未実施', 'OK'],
    });
  });

  it('チェックの列は TRUE を先に置く', () => {
    expect(sortSpecFor(1, 'asc', { kind: 'checkbox', required: false }).options).toEqual(['TRUE', 'FALSE']);
  });

  it('型が分からなければ文字として比べる', () => {
    expect(sortSpecFor(1, 'asc', undefined).kind).toBe('text');
  });
});

describe('filterModeOf — 列の型で絞り方を決める', () => {
  it.each([
    ['select', 'values'],
    ['radio', 'values'],
    ['checkbox', 'values'],
    ['number', 'number'],
    ['date', 'date'],
    ['datetime', 'date'],
    ['text', 'text'],
    ['multiline', 'text'],
    ['url', 'text'],
  ] as const)('%s は %s', (kind, mode) => {
    expect(filterModeOf({ kind, required: false })).toBe(mode);
  });
});

describe('valueChoicesOf — 一覧に並べる値', () => {
  it('選択肢の順、選択肢に無い値、空欄の順に並べる', () => {
    const widget: CellWidget = { kind: 'select', options: ['未実施', 'OK', 'NG'], required: false };
    expect(valueChoicesOf(widget, ['OK', ' 要確認 ', '', 'NG', '要確認'])).toEqual([
      '未実施',
      'OK',
      'NG',
      '要確認',
      '',
    ]);
  });

  it('チェックの列は TRUE / FALSE / 空欄', () => {
    expect(valueChoicesOf({ kind: 'checkbox', required: false }, ['TRUE'])).toEqual(['TRUE', 'FALSE', '']);
  });
});
