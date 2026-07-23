import { describe, it, expect } from 'vitest';
import type { ParsedHeader } from '@md-business/schema-test-spec-tsv';
import {
  MIN_COL_WIDTH,
  defaultColWidth,
  defaultColWidths,
  clampColWidth,
  resizeColWidth,
  setColWidth,
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
