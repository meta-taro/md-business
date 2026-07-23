import { describe, it, expect } from 'vitest';
import type { TsvDocument } from '@md-business/schema-test-spec-tsv';
import {
  rangeBounds,
  isInRange,
  isSingleCell,
  extendRange,
  rangeToTsv,
  rowRange,
} from './gridRange';

/**
 * 検証グリッドの矩形範囲選択（田中さん UX「検証のしやすさが最大のポイント」の続き）。
 * Shift+矢印 / Shift+クリックで範囲を広げ、Ctrl+C でブロックを TSV コピーするための純ロジック。
 */

describe('rangeBounds', () => {
  it('anchor と focus を左上→右下の包含境界へ正規化', () => {
    expect(rangeBounds({ anchor: { row: 3, col: 5 }, focus: { row: 1, col: 2 } })).toEqual({
      r0: 1,
      c0: 2,
      r1: 3,
      c1: 5,
    });
  });

  it('単一セルは r0=r1 / c0=c1', () => {
    expect(rangeBounds({ anchor: { row: 2, col: 4 }, focus: { row: 2, col: 4 } })).toEqual({
      r0: 2,
      c0: 4,
      r1: 2,
      c1: 4,
    });
  });
});

describe('isInRange', () => {
  const range = { anchor: { row: 1, col: 1 }, focus: { row: 3, col: 2 } };
  it('境界内は true', () => {
    expect(isInRange(range, 1, 1)).toBe(true);
    expect(isInRange(range, 3, 2)).toBe(true);
    expect(isInRange(range, 2, 2)).toBe(true);
  });
  it('境界外は false', () => {
    expect(isInRange(range, 0, 1)).toBe(false);
    expect(isInRange(range, 1, 0)).toBe(false);
    expect(isInRange(range, 4, 2)).toBe(false);
    expect(isInRange(range, 3, 3)).toBe(false);
  });
});

describe('isSingleCell', () => {
  it('anchor と focus が同じなら true', () => {
    expect(isSingleCell({ anchor: { row: 2, col: 2 }, focus: { row: 2, col: 2 } })).toBe(true);
  });
  it('広がっていれば false', () => {
    expect(isSingleCell({ anchor: { row: 2, col: 2 }, focus: { row: 2, col: 3 } })).toBe(false);
  });
});

describe('extendRange', () => {
  const dims = { rows: 4, cols: 3 };
  it('focus を移動量ぶん動かし anchor は固定', () => {
    const next = extendRange({ anchor: { row: 1, col: 1 }, focus: { row: 1, col: 1 } }, { dr: 1, dc: 1 }, dims);
    expect(next.anchor).toEqual({ row: 1, col: 1 });
    expect(next.focus).toEqual({ row: 2, col: 2 });
  });
  it('グリッド端でクランプ（範囲外へは出ない）', () => {
    const next = extendRange({ anchor: { row: 0, col: 0 }, focus: { row: 0, col: 0 } }, { dr: -1, dc: -1 }, dims);
    expect(next.focus).toEqual({ row: 0, col: 0 });
    const far = extendRange({ anchor: { row: 0, col: 0 }, focus: { row: 3, col: 2 } }, { dr: 5, dc: 5 }, dims);
    expect(far.focus).toEqual({ row: 3, col: 2 });
  });
});

describe('rangeToTsv', () => {
  const doc: TsvDocument = {
    formatId: 'md-business:test-spec-tsv/v1',
    meta: {},
    directives: [],
    columns: [
      { name: 'A', type: 'text', required: false },
      { name: 'B', type: 'text', required: false },
      { name: 'C', type: 'text', required: false },
    ],
    rows: [
      ['a1', 'b1', 'c1'],
      ['a2', 'b2', 'c2'],
      ['a3', 'b3', 'c3'],
    ],
  } as TsvDocument;

  it('矩形範囲をタブ区切り × 改行で直列化', () => {
    const range = { anchor: { row: 0, col: 1 }, focus: { row: 1, col: 2 } };
    expect(rangeToTsv(doc, range)).toBe('b1\tc1\nb2\tc2');
  });

  it('単一セルはその値のみ', () => {
    const range = { anchor: { row: 2, col: 0 }, focus: { row: 2, col: 0 } };
    expect(rangeToTsv(doc, range)).toBe('a3');
  });

  it('欠けたセルは空文字で位置を保つ', () => {
    const sparse: TsvDocument = { ...doc, rows: [['x'], ['y', 'z']] };
    const range = { anchor: { row: 0, col: 0 }, focus: { row: 1, col: 1 } };
    expect(rangeToTsv(sparse, range)).toBe('x\t\ny\tz');
  });
});

describe('rowRange', () => {
  it('行番号クリック＝先頭列から末尾列までの矩形（行全体）', () => {
    expect(rowRange(2, 3)).toEqual({
      anchor: { row: 2, col: 0 },
      focus: { row: 2, col: 2 },
    });
  });
  it('列が 0 でも focus 列は 0 でクランプ', () => {
    expect(rowRange(1, 0)).toEqual({
      anchor: { row: 1, col: 0 },
      focus: { row: 1, col: 0 },
    });
  });
});
