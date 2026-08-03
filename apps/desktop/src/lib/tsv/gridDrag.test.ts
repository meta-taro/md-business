import { describe, it, expect } from 'vitest';
import { canStartDrag, beginDrag } from './gridDrag';
import type { CellRange } from './gridRange';

const dims = { rows: 5, cols: 4 };

describe('canStartDrag', () => {
  it('主ボタンで、編集中でなければ始める', () => {
    expect(canStartDrag({ button: 0 })).toBe(true);
  });

  it('右クリックでは始めない（文脈メニューを奪わない）', () => {
    expect(canStartDrag({ button: 2 })).toBe(false);
  });

  it('中ボタンでは始めない', () => {
    expect(canStartDrag({ button: 1 })).toBe(false);
  });

  it('編集中のセルでは始めない（ウィジェットの操作を奪わない）', () => {
    expect(canStartDrag({ button: 0, editing: true })).toBe(false);
  });
});

describe('beginDrag', () => {
  const range: CellRange = { anchor: { row: 1, col: 1 }, focus: { row: 3, col: 2 } };

  it('単独押下は押した 1 セルへ畳む', () => {
    expect(beginDrag(range, { row: 4, col: 0 }, { button: 0 }, dims)).toEqual({
      anchor: { row: 4, col: 0 },
      focus: { row: 4, col: 0 },
    });
  });

  it('Shift 併用はアンカーを保って伸ばす', () => {
    expect(beginDrag(range, { row: 4, col: 3 }, { button: 0, shift: true }, dims)).toEqual({
      anchor: { row: 1, col: 1 },
      focus: { row: 4, col: 3 },
    });
  });

  it('グリッド外の座標はクランプする', () => {
    expect(beginDrag(range, { row: 99, col: -1 }, { button: 0 }, dims)).toEqual({
      anchor: { row: 4, col: 0 },
      focus: { row: 4, col: 0 },
    });
  });

  it('入力の範囲を書き換えない', () => {
    const before = structuredClone(range);
    beginDrag(range, { row: 0, col: 0 }, { button: 0 }, dims);
    expect(range).toEqual(before);
  });
});
