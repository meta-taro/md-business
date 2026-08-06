import { describe, expect, it } from 'vitest';
import { countLockedPasteCells } from './gridComputed';

describe('countLockedPasteCells', () => {
  const locked = new Set([0]);

  it('計算列に当たるセル数を数える', () => {
    const matrix = [
      ['1', 'ログイン'],
      ['2', 'ログアウト'],
    ];

    expect(countLockedPasteCells(matrix, { row: 0, col: 0 }, locked, 4)).toBe(2);
  });

  it('計算列に当たらなければ 0', () => {
    const matrix = [['ログイン', 'OK']];

    expect(countLockedPasteCells(matrix, { row: 0, col: 1 }, locked, 4)).toBe(0);
  });

  it('列数を超えて溢れたセルは数えない（貼り付け側も切り捨てる）', () => {
    const matrix = [['a', 'b', 'c']];

    expect(countLockedPasteCells(matrix, { row: 0, col: 2 }, new Set([0, 5]), 4)).toBe(0);
  });
});
