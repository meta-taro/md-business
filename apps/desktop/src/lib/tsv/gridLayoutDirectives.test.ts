import { describe, it, expect } from 'vitest';
import type { ColOverflowMode } from './gridColumnMode';
import {
  readLayout,
  writeLayoutDirectives,
  type LayoutDefaults,
  type GridLayout,
} from './gridLayoutDirectives';

/**
 * 検証グリッドのレイアウト永続化（Issue 010・
 * 列幅・行高・改行時の表示を変えられるようにし、それらを tsv 側に記憶する）。
 *
 * 列幅 / 行高 / 列表示モードを `#@ colwidth|rowheight|colmode` ディレクティブに載せ、
 * 既存パーサ（`doc.directives` を round-trip）へそのまま焼く。既定値と一致する項目は
 * 出力しない（sparse・git diff を最小化）。ここはその純ロジックだけを検査する。
 */

const defaults: LayoutDefaults = {
  colWidths: [176, 88, 256],
  colModes: ['clip', 'clip', 'wrap'],
  rowHeight: 30,
};

describe('readLayout', () => {
  it('レイアウトディレクティブが無ければ全て既定値', () => {
    const layout = readLayout([], 2, defaults);
    expect(layout.colWidths).toEqual([176, 88, 256]);
    expect(layout.colModes).toEqual(['clip', 'clip', 'wrap']);
    expect(layout.rowHeights).toEqual([30, 30]);
  });

  it('colwidth は指定列だけ上書き、他は既定', () => {
    const layout = readLayout(['colwidth 0=240 2=120'], 1, defaults);
    expect(layout.colWidths).toEqual([240, 88, 120]);
  });

  it('rowheight は範囲内の行だけ上書き、範囲外は無視', () => {
    const layout = readLayout(['rowheight 1=60 9=200'], 3, defaults);
    expect(layout.rowHeights).toEqual([30, 60, 30]);
  });

  it('colmode は妥当なモードのみ採用（不正値は無視）', () => {
    const layout = readLayout(['colmode 0=wrap 1=bogus'], 0, defaults);
    expect(layout.colModes).toEqual(['wrap', 'clip', 'wrap']);
  });

  it('範囲外・非数の列指定は無視する', () => {
    const layout = readLayout(['colwidth 5=300 x=99 1=0'], 0, defaults);
    // 5 は範囲外、x は非数、0px は下限割れとして無視 → 全て既定のまま
    expect(layout.colWidths).toEqual([176, 88, 256]);
  });

  it('style など他ディレクティブは読み飛ばす', () => {
    const layout = readLayout(['style 結果 〇=#e6f4ea', 'colwidth 1=100'], 0, defaults);
    expect(layout.colWidths).toEqual([176, 100, 256]);
  });
});

describe('writeLayoutDirectives', () => {
  const base: GridLayout = {
    colWidths: [176, 88, 256],
    colModes: ['clip', 'clip', 'wrap'],
    rowHeights: [30, 30],
  };

  it('既定と一致する項目は出力しない（差分ゼロ→レイアウト行なし）', () => {
    expect(writeLayoutDirectives([], base, defaults)).toEqual([]);
  });

  it('差分だけを sparse に書き出す', () => {
    const layout: GridLayout = {
      colWidths: [240, 88, 256],
      colModes: ['clip', 'overflow', 'wrap'],
      rowHeights: [30, 72],
    };
    expect(writeLayoutDirectives([], layout, defaults)).toEqual([
      'colwidth 0=240',
      'rowheight 1=72',
      'colmode 1=overflow',
    ]);
  });

  it('レイアウト以外のディレクティブは先頭に温存し、レイアウト行を後ろへ', () => {
    const layout: GridLayout = { ...base, colWidths: [200, 88, 256] };
    const result = writeLayoutDirectives(['style 結果 〇=#e6f4ea'], layout, defaults);
    expect(result).toEqual(['style 結果 〇=#e6f4ea', 'colwidth 0=200']);
  });

  it('既存のレイアウト行は置き換える（重複しない）', () => {
    const layout: GridLayout = { ...base, colWidths: [300, 88, 256] };
    const result = writeLayoutDirectives(['colwidth 0=120', 'style X 1=#fff'], layout, defaults);
    expect(result).toEqual(['style X 1=#fff', 'colwidth 0=300']);
  });

  it('read(write(layout)) は差分を復元する（round-trip）', () => {
    const layout: GridLayout = {
      colWidths: [240, 100, 256],
      colModes: ['clip', 'clip', 'overflow'],
      rowHeights: [30, 48, 30],
    };
    const directives = writeLayoutDirectives(['style keep'], layout, defaults);
    const restored = readLayout(directives, 3, defaults);
    expect(restored).toEqual(layout);
  });
});
