import { describe, it, expect } from 'vitest';
import { isBlankRow, displayRowCount, editPaddedCell } from './gridBlankRows';

/**
 * 検証グリッドの「空パッド行」モデル（Issue 010・田中さん 2026-07-23
 * 「行の追加を押しても増えなかった」不具合）。
 * カスタム TSV は全セルが空の行をテキスト化できない（tsv 化するとタブのみ行 →
 * parse が空行として読み飛ばす）。空行は値が入るまでローカル pad 行として持ち、
 * 値が入った時点で実データ行へ実体化する。その純ロジックを検査する。
 */

describe('isBlankRow', () => {
  it('全セルが空文字なら true', () => {
    expect(isBlankRow(['', '', ''])).toBe(true);
  });
  it('空配列（列未展開の pad 行）も true', () => {
    expect(isBlankRow([])).toBe(true);
  });
  it('1 つでも値があれば false', () => {
    expect(isBlankRow(['', 'x', ''])).toBe(false);
  });
});

describe('displayRowCount', () => {
  it('実データ行 + pad 行', () => {
    expect(displayRowCount(3, 2)).toBe(5);
  });
  it('pad が負なら 0 扱い', () => {
    expect(displayRowCount(3, -1)).toBe(3);
  });
});

describe('editPaddedCell', () => {
  it('唯一の pad 行に値を入れると実データへ繰り上がる（pad 1→0）', () => {
    const res = editPaddedCell([['a', 'b']], 1, 1, 0, 'x');
    expect(res.rows).toEqual([
      ['a', 'b'],
      ['x'],
    ]);
    expect(res.padRows).toBe(0);
  });

  it('複数 pad のうち 1 行を埋めると pad が 1 減り表示行数は保たれる', () => {
    // 実データ 1 行 + pad 2 行 = 表示 3 行。末尾 pad(row=2) を埋める。
    const res = editPaddedCell([['a']], 2, 2, 0, 'b');
    // 間の空 pad(row=1) は畳まれ、値の入った行が実データへ繰り上がる。
    expect(res.rows).toEqual([['a'], ['b']]);
    // 表示行数 3 を保つ: 実データ 2 行 + pad 1。
    expect(res.padRows).toBe(1);
  });

  it('pad 行へ空文字を書いても実体化しない（rows 不変・pad 保持）', () => {
    const res = editPaddedCell([['a']], 1, 1, 0, '');
    expect(res.rows).toEqual([['a']]);
    expect(res.padRows).toBe(1);
  });

  it('実データ行の途中セルを更新しても全空行は畳まれる', () => {
    const res = editPaddedCell(
      [
        ['a', ''],
        ['', ''],
      ],
      0,
      0,
      1,
      'z',
    );
    // row0 に値が増え、全空の row1 は畳まれる。表示行数 2 は保たれ pad へ回る。
    expect(res.rows).toEqual([['a', 'z']]);
    expect(res.padRows).toBe(1);
  });

  it('対象行を col まで空セルで伸ばしてから書き込む', () => {
    const res = editPaddedCell([['a']], 1, 1, 2, 'v');
    expect(res.rows).toEqual([['a'], ['', '', 'v']]);
    expect(res.padRows).toBe(0);
  });
});
