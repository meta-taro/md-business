import { describe, it, expect } from 'vitest';
import { nextCell, type CellPos, type GridDims } from './gridNav';

/**
 * スプレッドシート風のセル間移動（田中さん要件 2026-07-22「検証UXは最大のポイント」）。
 * キーボードでアクティブセルを動かす純ロジック。DOM 非依存でここだけ単体検査する。
 */

const DIMS: GridDims = { rows: 3, cols: 4 }; // 3 行 4 列
const at = (row: number, col: number): CellPos => ({ row, col });

describe('nextCell', () => {
  it('矢印: 上下左右に 1 セル動く', () => {
    expect(nextCell(at(1, 1), { key: 'ArrowDown' }, DIMS)).toEqual(at(2, 1));
    expect(nextCell(at(1, 1), { key: 'ArrowUp' }, DIMS)).toEqual(at(0, 1));
    expect(nextCell(at(1, 1), { key: 'ArrowRight' }, DIMS)).toEqual(at(1, 2));
    expect(nextCell(at(1, 1), { key: 'ArrowLeft' }, DIMS)).toEqual(at(1, 0));
  });

  it('矢印: 端ではクランプして留まる（ラップしない）', () => {
    expect(nextCell(at(0, 0), { key: 'ArrowUp' }, DIMS)).toEqual(at(0, 0));
    expect(nextCell(at(0, 0), { key: 'ArrowLeft' }, DIMS)).toEqual(at(0, 0));
    expect(nextCell(at(2, 3), { key: 'ArrowDown' }, DIMS)).toEqual(at(2, 3));
    expect(nextCell(at(2, 3), { key: 'ArrowRight' }, DIMS)).toEqual(at(2, 3));
  });

  it('Enter: 下へ、Shift+Enter: 上へ（クランプ）', () => {
    expect(nextCell(at(0, 2), { key: 'Enter' }, DIMS)).toEqual(at(1, 2));
    expect(nextCell(at(2, 2), { key: 'Enter' }, DIMS)).toEqual(at(2, 2));
    expect(nextCell(at(1, 2), { key: 'Enter', shift: true }, DIMS)).toEqual(at(0, 2));
    expect(nextCell(at(0, 2), { key: 'Enter', shift: true }, DIMS)).toEqual(at(0, 2));
  });

  it('Tab: 右へ、行末は次行の先頭へ折り返す', () => {
    expect(nextCell(at(0, 0), { key: 'Tab' }, DIMS)).toEqual(at(0, 1));
    expect(nextCell(at(0, 3), { key: 'Tab' }, DIMS)).toEqual(at(1, 0));
  });

  it('Tab: 最終セルではクランプして留まる', () => {
    expect(nextCell(at(2, 3), { key: 'Tab' }, DIMS)).toEqual(at(2, 3));
  });

  it('Shift+Tab: 左へ、行頭は前行の末尾へ折り返す', () => {
    expect(nextCell(at(0, 1), { key: 'Tab', shift: true }, DIMS)).toEqual(at(0, 0));
    expect(nextCell(at(1, 0), { key: 'Tab', shift: true }, DIMS)).toEqual(at(0, 3));
    expect(nextCell(at(0, 0), { key: 'Tab', shift: true }, DIMS)).toEqual(at(0, 0));
  });

  it('Home/End: 同一行の先頭 / 末尾へ', () => {
    expect(nextCell(at(1, 2), { key: 'Home' }, DIMS)).toEqual(at(1, 0));
    expect(nextCell(at(1, 2), { key: 'End' }, DIMS)).toEqual(at(1, 3));
  });

  it('Ctrl+Home / Ctrl+End: 表全体の左上 / 右下へ', () => {
    expect(nextCell(at(1, 2), { key: 'Home', ctrl: true }, DIMS)).toEqual(at(0, 0));
    expect(nextCell(at(1, 2), { key: 'End', ctrl: true }, DIMS)).toEqual(at(2, 3));
  });

  it('移動キー以外は null（呼び出し側は preventDefault しない）', () => {
    expect(nextCell(at(1, 1), { key: 'a' }, DIMS)).toBeNull();
    expect(nextCell(at(1, 1), { key: 'Escape' }, DIMS)).toBeNull();
  });

  it('空グリッドは null', () => {
    expect(nextCell(at(0, 0), { key: 'ArrowDown' }, { rows: 0, cols: 0 })).toBeNull();
  });

  it('範囲外の開始位置もクランプして扱う', () => {
    expect(nextCell(at(9, 9), { key: 'ArrowUp' }, DIMS)).toEqual(at(1, 3));
  });
});
