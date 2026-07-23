import { describe, it, expect } from 'vitest';
import type { ParsedHeader } from '@md-business/schema-test-spec-tsv';
import {
  MIN_COL_WIDTH,
  MAX_COL_WIDTH,
  defaultColWidth,
  defaultColWidths,
  clampColWidth,
  resizeColWidth,
  setColWidth,
  fitColWidth,
} from './gridLayout';

/**
 * 検証グリッドの列幅レイアウト（田中さん 2026-07-23「列幅を自由に調整したい」）。
 * 明示 px 幅 + table-layout:fixed の土台。初期幅・クランプ・ドラッグ計算を純関数で検査。
 */

const col = (
  name: string,
  type: ParsedHeader['type'],
  extra: Partial<ParsedHeader> = {},
): ParsedHeader => ({ name, type, required: false, ...extra });

describe('defaultColWidth', () => {
  it('型ごとに既定幅を返す（number は text より狭い）', () => {
    expect(defaultColWidth(col('件数', 'number'))).toBeLessThan(defaultColWidth(col('項目', 'text')));
  });

  it('multiline は広め、checkbox は狭め', () => {
    expect(defaultColWidth(col('手順', 'multiline_text'))).toBeGreaterThan(
      defaultColWidth(col('完了', 'checkbox')),
    );
  });

  it('enum の ui:radio は radio 幅、既定は select 幅', () => {
    const radio = defaultColWidth(col('判定', 'enum', { ui: 'radio', enumValues: ['A', 'B'] }));
    const select = defaultColWidth(col('結果', 'enum', { enumValues: ['〇', '×'] }));
    expect(radio).not.toBe(select);
  });

  it('どの既定幅も下限以上', () => {
    for (const type of ['text', 'multiline_text', 'enum', 'date', 'number', 'checkbox', 'url'] as const) {
      expect(defaultColWidth(col('x', type))).toBeGreaterThanOrEqual(MIN_COL_WIDTH);
    }
  });
});

describe('defaultColWidths', () => {
  it('列ごとの既定幅を順に返す', () => {
    const widths = defaultColWidths([col('項目', 'text'), col('完了', 'checkbox')]);
    expect(widths).toHaveLength(2);
    expect(widths[0]).toBe(defaultColWidth(col('項目', 'text')));
    expect(widths[1]).toBe(defaultColWidth(col('完了', 'checkbox')));
  });

  it('列なしは空配列', () => {
    expect(defaultColWidths([])).toEqual([]);
  });
});

describe('clampColWidth', () => {
  it('下限未満は下限へ', () => {
    expect(clampColWidth(10)).toBe(MIN_COL_WIDTH);
  });

  it('下限以上はそのまま（整数へ丸め）', () => {
    expect(clampColWidth(120.4)).toBe(120);
    expect(clampColWidth(120.6)).toBe(121);
  });

  it('カスタム下限を尊重する', () => {
    expect(clampColWidth(30, 40)).toBe(40);
  });
});

describe('resizeColWidth', () => {
  it('開始幅に移動量を足す', () => {
    expect(resizeColWidth(160, 40)).toBe(200);
    expect(resizeColWidth(160, -30)).toBe(130);
  });

  it('下限を割り込む縮小はクランプ', () => {
    expect(resizeColWidth(80, -100)).toBe(MIN_COL_WIDTH);
  });
});

describe('setColWidth', () => {
  it('指定列だけ更新し、入力は不変', () => {
    const widths = [160, 88, 200];
    const next = setColWidth(widths, 1, 120);
    expect(next).toEqual([160, 120, 200]);
    expect(widths).toEqual([160, 88, 200]); // 不変
    expect(next).not.toBe(widths);
  });

  it('更新幅も下限クランプ', () => {
    expect(setColWidth([160, 88], 0, 10)).toEqual([MIN_COL_WIDTH, 88]);
  });

  it('範囲外 index は同一参照で無視', () => {
    const widths = [160, 88];
    expect(setColWidth(widths, 5, 100)).toBe(widths);
    expect(setColWidth(widths, -1, 100)).toBe(widths);
  });
});

describe('fitColWidth', () => {
  // 列境界のダブルクリック＝内容に合わせた自動幅（田中さん 2026-07-23）。
  // 実測したセル内容の px 幅群 + 余白から妥当な列幅を求める純ロジック。
  it('最も広い内容 + 余白を幅にする', () => {
    expect(fitColWidth([80, 200, 120], { padding: 24 })).toBe(224);
  });

  it('内容が下限に満たなければ下限へ', () => {
    expect(fitColWidth([10, 12], { padding: 8 })).toBe(MIN_COL_WIDTH);
  });

  it('内容なし（空列）は下限', () => {
    expect(fitColWidth([], { padding: 24 })).toBe(MIN_COL_WIDTH);
  });

  it('上限で頭打ちにする（極端に長い内容）', () => {
    expect(fitColWidth([5000], { padding: 24 })).toBe(MAX_COL_WIDTH);
  });

  it('端数は整数 px へ丸める', () => {
    expect(fitColWidth([200.4], { padding: 0 })).toBe(200);
    expect(fitColWidth([200.6], { padding: 0 })).toBe(201);
  });

  it('既定の余白・下限・上限で動く（オプション省略）', () => {
    expect(fitColWidth([300])).toBeGreaterThanOrEqual(MIN_COL_WIDTH);
    expect(fitColWidth([300])).toBeLessThanOrEqual(MAX_COL_WIDTH);
    expect(fitColWidth([5])).toBe(MIN_COL_WIDTH);
  });

  it('カスタム上限を尊重する', () => {
    expect(fitColWidth([1000], { padding: 0, max: 400 })).toBe(400);
  });
});
