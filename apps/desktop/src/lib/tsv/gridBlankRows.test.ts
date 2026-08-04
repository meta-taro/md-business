import { describe, it, expect } from 'vitest';
import { isBlankRow, displayRowCount, editPaddedCell } from './gridBlankRows';

/**
 * 検証グリッドの「空パッド行」モデル（
 * 「行の追加を押しても増えない」不具合の対処）。
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

/** 行 ID は `id(1)`, `id(2)`, … と読めるようにして、並びの検査を目視できる形にする。 */
function id(n: number): string {
  return `r${String(n).padStart(12, '0')}`;
}

/** 採番を検査可能にする差し替え用。既存行の ID と混ざらないよう 900 番台から振る。 */
function counter(): () => string {
  let n = 900;
  return () => id(++n);
}

describe('editPaddedCell — 行 ID', () => {
  it('実体化した pad 行に ID を振る', () => {
    const res = editPaddedCell([['a']], [id(1)], 1, 1, 0, 'b', counter());

    expect(res.rows).toEqual([['a'], ['b']]);
    expect(res.rowIds).toEqual([id(1), id(901)]);
  });

  it('畳まれた行の ID は落とし、残った行の ID は動かさない', () => {
    // 途中の行が空になって畳まれても、後続の行は同じ行のまま。ID がずれると
    // 版間の突き合わせで「別の行が消えた」ように見える。
    const res = editPaddedCell(
      [['a'], ['b'], ['c']],
      [id(1), id(2), id(3)],
      0,
      1,
      0,
      '',
      counter(),
    );

    expect(res.rows).toEqual([['a'], ['c']]);
    expect(res.rowIds).toEqual([id(1), id(3)]);
  });

  it('セルを書き換えただけなら ID は変わらない', () => {
    const res = editPaddedCell([['a'], ['b']], [id(1), id(2)], 0, 0, 0, 'z', counter());

    expect(res.rowIds).toEqual([id(1), id(2)]);
  });
});

describe('editPaddedCell', () => {
  it('唯一の pad 行に値を入れると実データへ繰り上がる（pad 1→0）', () => {
    const res = editPaddedCell([['a', 'b']], [id(1)], 1, 1, 0, 'x', counter());
    expect(res.rows).toEqual([
      ['a', 'b'],
      ['x'],
    ]);
    expect(res.padRows).toBe(0);
  });

  it('複数 pad のうち 1 行を埋めると pad が 1 減り表示行数は保たれる', () => {
    // 実データ 1 行 + pad 2 行 = 表示 3 行。末尾 pad(row=2) を埋める。
    const res = editPaddedCell([['a']], [id(1)], 2, 2, 0, 'b', counter());
    // 間の空 pad(row=1) は畳まれ、値の入った行が実データへ繰り上がる。
    expect(res.rows).toEqual([['a'], ['b']]);
    // 表示行数 3 を保つ: 実データ 2 行 + pad 1。
    expect(res.padRows).toBe(1);
  });

  it('pad 行へ空文字を書いても実体化しない（rows 不変・pad 保持）', () => {
    const res = editPaddedCell([['a']], [id(1)], 1, 1, 0, '', counter());
    expect(res.rows).toEqual([['a']]);
    expect(res.padRows).toBe(1);
  });

  it('実データ行の途中セルを更新しても全空行は畳まれる', () => {
    const res = editPaddedCell(
      [
        ['a', ''],
        ['', ''],
      ],
      [id(1), id(2)],
      0,
      0,
      1,
      'z',
      counter(),
    );
    // row0 に値が増え、全空の row1 は畳まれる。表示行数 2 は保たれ pad へ回る。
    expect(res.rows).toEqual([['a', 'z']]);
    expect(res.padRows).toBe(1);
  });

  it('対象行を col まで空セルで伸ばしてから書き込む', () => {
    const res = editPaddedCell([['a']], [id(1)], 1, 1, 2, 'v', counter());
    expect(res.rows).toEqual([['a'], ['', '', 'v']]);
    expect(res.padRows).toBe(0);
  });
});
