import { describe, it, expect } from 'vitest';
import type { ColOverflowMode } from './gridColumnMode';
import {
  readLayout,
  writeLayoutDirectives,
  type LayoutDefaults,
  type GridLayout,
} from './gridLayoutDirectives';

/**
 * 検証グリッドのレイアウト永続化（
 * 列幅・行高・改行時の表示を変えられるようにし、それらを tsv 側に記憶する）。
 *
 * 列幅 / 行高 / 列表示モードを `#@ colwidth|rowheight|colmode` ディレクティブに載せ、
 * 既存パーサ（`doc.directives` を round-trip）へそのまま焼く。既定値と一致する項目は
 * 出力しない（sparse・git diff を最小化）。ここはその純ロジックだけを検査する。
 *
 * 行の指定だけは **行 ID** をキーにする。列と違い行は途中に挿さるため、行インデックスの
 * ままだと行を 1 本足しただけで以降の行高が全部ずれる。既存ファイルとの互換のため、
 * 読むときは数字キー（＝行インデックス）も受ける。
 */

const defaults: LayoutDefaults = {
  colWidths: [176, 88, 256],
  colModes: ['clip', 'clip', 'wrap'],
  colAligns: ['left', 'right', 'left'],
  rowHeight: 30,
};

/** 行 ID は `id(1)`, `id(2)`, … と読めるようにして、並びの検査を目視できる形にする。 */
function id(n: number): string {
  return `r${String(n).padStart(12, '0')}`;
}

/** `id(1)` から順に n 行ぶんの ID。 */
function ids(n: number): string[] {
  return Array.from({ length: n }, (_, i) => id(i + 1));
}

describe('readLayout', () => {
  it('レイアウトディレクティブが無ければ全て既定値', () => {
    const layout = readLayout([], ids(2), defaults);
    expect(layout.colWidths).toEqual([176, 88, 256]);
    expect(layout.colModes).toEqual(['clip', 'clip', 'wrap']);
    expect(layout.colAligns).toEqual(['left', 'right', 'left']);
    expect(layout.rowHeights).toEqual([30, 30]);
  });

  it('colwidth は指定列だけ上書き、他は既定', () => {
    const layout = readLayout(['colwidth 0=240 2=120'], ids(1), defaults);
    expect(layout.colWidths).toEqual([240, 88, 120]);
  });

  it('colmode は妥当なモードのみ採用（不正値は無視）', () => {
    const layout = readLayout(['colmode 0=wrap 1=bogus'], [], defaults);
    expect(layout.colModes).toEqual(['wrap', 'clip', 'wrap']);
  });

  it('align は妥当な寄せのみ採用（不正値は無視）', () => {
    const layout = readLayout(['align 0=center 1=bogus 9=right'], [], defaults);
    expect(layout.colAligns).toEqual(['center', 'right', 'left']);
  });

  it('範囲外・非数の列指定は無視する', () => {
    const layout = readLayout(['colwidth 5=300 x=99 1=0'], [], defaults);
    // 5 は範囲外、x は非数、0px は下限割れとして無視 → 全て既定のまま
    expect(layout.colWidths).toEqual([176, 88, 256]);
  });

  it('style など他ディレクティブは読み飛ばす', () => {
    const layout = readLayout(['style 結果 〇=#e6f4ea', 'colwidth 1=100'], [], defaults);
    expect(layout.colWidths).toEqual([176, 100, 256]);
  });
});

describe('readLayout — rowheight', () => {
  it('行 ID の指す行に効く', () => {
    const layout = readLayout([`rowheight ${id(2)}=60`], ids(3), defaults);
    expect(layout.rowHeights).toEqual([30, 60, 30]);
  });

  it('この文書に無い ID の指定は捨てる', () => {
    // 行が消えたあとも指定だけ残ることがある。別の行へ流用しない。
    const layout = readLayout([`rowheight ${id(9)}=60`], ids(3), defaults);
    expect(layout.rowHeights).toEqual([30, 30, 30]);
  });

  it('数字キーは行インデックスとして受ける（ID を持たない既存ファイル）', () => {
    const layout = readLayout(['rowheight 1=60 9=200'], ids(3), defaults);
    expect(layout.rowHeights).toEqual([30, 60, 30]);
  });

  it('下限割れ・非数の値は無視する', () => {
    const layout = readLayout([`rowheight ${id(1)}=0 ${id(2)}=x`], ids(2), defaults);
    expect(layout.rowHeights).toEqual([30, 30]);
  });
});

describe('writeLayoutDirectives', () => {
  const base: GridLayout = {
    colWidths: [176, 88, 256],
    colModes: ['clip', 'clip', 'wrap'],
    colAligns: ['left', 'right', 'left'],
    rowHeights: [30, 30],
  };

  it('既定と一致する項目は出力しない（差分ゼロ→レイアウト行なし）', () => {
    expect(writeLayoutDirectives([], base, defaults, ids(2))).toEqual([]);
  });

  it('差分だけを sparse に書き出す（行高は ID キー）', () => {
    const layout: GridLayout = {
      colWidths: [240, 88, 256],
      colModes: ['clip', 'overflow', 'wrap'],
      colAligns: ['left', 'right', 'center'],
      rowHeights: [30, 72],
    };
    expect(writeLayoutDirectives([], layout, defaults, ids(2))).toEqual([
      'colwidth 0=240',
      `rowheight ${id(2)}=72`,
      'colmode 1=overflow',
      'align 2=center',
    ]);
  });

  it('レイアウト以外のディレクティブは先頭に温存し、レイアウト行を後ろへ', () => {
    const layout: GridLayout = { ...base, colWidths: [200, 88, 256] };
    const result = writeLayoutDirectives(['style 結果 〇=#e6f4ea'], layout, defaults, ids(2));
    expect(result).toEqual(['style 結果 〇=#e6f4ea', 'colwidth 0=200']);
  });

  it('既存のレイアウト行は置き換える（重複しない）', () => {
    const layout: GridLayout = { ...base, colWidths: [300, 88, 256] };
    const result = writeLayoutDirectives(
      ['colwidth 0=120', 'style X 1=#fff'],
      layout,
      defaults,
      ids(2),
    );
    expect(result).toEqual(['style X 1=#fff', 'colwidth 0=300']);
  });

  it('既存の align 行も置き換える（重複しない）', () => {
    const layout: GridLayout = { ...base, colAligns: ['center', 'right', 'left'] };
    const result = writeLayoutDirectives(['align 2=right'], layout, defaults, ids(2));
    expect(result).toEqual(['align 0=center']);
  });

  it('行インデックスで書かれた既存の行高は ID キーへ移す', () => {
    const layout: GridLayout = { ...base, rowHeights: [30, 72] };
    const result = writeLayoutDirectives(['rowheight 1=72'], layout, defaults, ids(2));
    expect(result).toEqual([`rowheight ${id(2)}=72`]);
  });

  it('read(write(layout)) は差分を復元する（round-trip）', () => {
    const layout: GridLayout = {
      colWidths: [240, 100, 256],
      colModes: ['clip', 'clip', 'overflow'],
      colAligns: ['center', 'right', 'right'],
      rowHeights: [30, 48, 30],
    };
    const directives = writeLayoutDirectives(['style keep'], layout, defaults, ids(3));
    const restored = readLayout(directives, ids(3), defaults);
    expect(restored).toEqual(layout);
  });

  it('行を挿しても行高は同じ行に付いてくる', () => {
    // 行インデックスをキーにしていたときの壊れ方＝1 行挿すと以降の行高が全部ずれる。
    // ID をキーにする理由がこれ。
    const layout: GridLayout = { ...base, rowHeights: [30, 48, 30] };
    const directives = writeLayoutDirectives([], layout, defaults, ids(3));

    // 先頭に 1 行挿した状態で読み直す。
    const after = readLayout(directives, [id(99), ...ids(3)], defaults);
    expect(after.rowHeights).toEqual([30, 30, 48, 30]);
  });
});
