import { describe, it, expect } from 'vitest';
import {
  MIN_ROW_HEIGHT,
  DEFAULT_ROW_HEIGHT,
  defaultRowHeights,
  clampRowHeight,
  resizeRowHeight,
  setRowHeight,
  reconcileRowHeights,
} from './gridRowLayout';

/**
 * 検証グリッドの行高レイアウト（行の高さを可変にする）。
 * 列幅（gridLayout）と対称の純ロジック。既定高・クランプ・ドラッグ・行数調整を検査。
 */

describe('defaultRowHeights', () => {
  it('行数ぶんの既定高を返す', () => {
    expect(defaultRowHeights(3)).toEqual([
      DEFAULT_ROW_HEIGHT,
      DEFAULT_ROW_HEIGHT,
      DEFAULT_ROW_HEIGHT,
    ]);
  });

  it('0 行は空配列', () => {
    expect(defaultRowHeights(0)).toEqual([]);
  });
});

describe('clampRowHeight', () => {
  it('下限未満は下限へ', () => {
    expect(clampRowHeight(5)).toBe(MIN_ROW_HEIGHT);
  });

  it('下限以上はそのまま（整数へ丸め）', () => {
    expect(clampRowHeight(48.4)).toBe(48);
    expect(clampRowHeight(48.6)).toBe(49);
  });
});

describe('resizeRowHeight', () => {
  it('開始高に移動量を足す', () => {
    expect(resizeRowHeight(30, 20)).toBe(50);
    expect(resizeRowHeight(60, -15)).toBe(45);
  });

  it('下限を割り込む縮小はクランプ', () => {
    expect(resizeRowHeight(30, -100)).toBe(MIN_ROW_HEIGHT);
  });
});

describe('setRowHeight', () => {
  it('指定行だけ更新し、入力は不変', () => {
    const heights = [30, 30, 60];
    const next = setRowHeight(heights, 1, 48);
    expect(next).toEqual([30, 48, 60]);
    expect(heights).toEqual([30, 30, 60]); // 不変
    expect(next).not.toBe(heights);
  });

  it('更新高も下限クランプ', () => {
    expect(setRowHeight([30, 30], 0, 5)).toEqual([MIN_ROW_HEIGHT, 30]);
  });

  it('範囲外 index は同一参照で無視', () => {
    const heights = [30, 30];
    expect(setRowHeight(heights, 9, 50)).toBe(heights);
    expect(setRowHeight(heights, -1, 50)).toBe(heights);
  });
});

describe('reconcileRowHeights', () => {
  // 行の追加・削除で件数が変わっても、既存行の手動高は保つ（編集でリセットしない）。
  it('件数が増えたら末尾を既定高で伸ばす', () => {
    expect(reconcileRowHeights([48, 30], 4)).toEqual([48, 30, DEFAULT_ROW_HEIGHT, DEFAULT_ROW_HEIGHT]);
  });

  it('件数が減ったら末尾を切り詰める', () => {
    expect(reconcileRowHeights([48, 30, 60], 2)).toEqual([48, 30]);
  });

  it('件数が同じなら同一参照のまま', () => {
    const heights = [48, 30];
    expect(reconcileRowHeights(heights, 2)).toBe(heights);
  });

  it('0 行は空配列', () => {
    expect(reconcileRowHeights([48, 30], 0)).toEqual([]);
  });
});
