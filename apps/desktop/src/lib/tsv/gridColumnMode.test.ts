import { describe, it, expect } from 'vitest';
import type { ParsedHeader } from '@md-business/schema-test-spec-tsv';
import {
  COL_OVERFLOW_MODES,
  defaultColMode,
  defaultColModes,
  setColMode,
  reconcileColModes,
  colModeMenuItems,
} from './gridColumnMode';

/**
 * 検証グリッドの列表示モード（田中さん 2026-07-23「右クリックで折り返す／突き抜ける／
 * 見切れるを選びたい」）。右クリックメニューの選択肢と列ごとのモード状態を司る純ロジック。
 */

const col = (
  name: string,
  type: ParsedHeader['type'],
  extra: Partial<ParsedHeader> = {},
): ParsedHeader => ({ name, type, required: false, ...extra });

describe('defaultColMode', () => {
  it('複数行列は折り返し（wrap）が既定', () => {
    expect(defaultColMode(col('手順', 'multiline_text'))).toBe('wrap');
  });

  it('それ以外は見切れ（clip）が既定', () => {
    expect(defaultColMode(col('項目', 'text'))).toBe('clip');
    expect(defaultColMode(col('件数', 'number'))).toBe('clip');
  });
});

describe('defaultColModes', () => {
  it('列ごとの既定モードを順に返す', () => {
    const modes = defaultColModes([col('項目', 'text'), col('手順', 'multiline_text')]);
    expect(modes).toEqual(['clip', 'wrap']);
  });

  it('列なしは空配列', () => {
    expect(defaultColModes([])).toEqual([]);
  });
});

describe('setColMode', () => {
  it('指定列だけ更新し、入力は不変', () => {
    const modes: ('clip' | 'wrap' | 'overflow')[] = ['clip', 'clip', 'wrap'];
    const next = setColMode(modes, 1, 'overflow');
    expect(next).toEqual(['clip', 'overflow', 'wrap']);
    expect(modes).toEqual(['clip', 'clip', 'wrap']); // 不変
    expect(next).not.toBe(modes);
  });

  it('範囲外 index は同一参照で無視', () => {
    const modes: ('clip' | 'wrap' | 'overflow')[] = ['clip', 'wrap'];
    expect(setColMode(modes, 5, 'overflow')).toBe(modes);
    expect(setColMode(modes, -1, 'overflow')).toBe(modes);
  });
});

describe('reconcileColModes', () => {
  // 列定義が差し替わった（別ファイルを開いた）ら既定へ戻す。列数だけ合わせるのでなく
  // 列そのものが変わったら作り直す（列幅と対称の考え方）。
  it('列数が変わったら既定モードで作り直す', () => {
    const modes: ('clip' | 'wrap' | 'overflow')[] = ['overflow', 'wrap'];
    const columns = [col('a', 'text'), col('b', 'multiline_text'), col('c', 'number')];
    expect(reconcileColModes(modes, columns)).toEqual(['clip', 'wrap', 'clip']);
  });

  it('列数が同じなら手動モードを保つ（同一参照）', () => {
    const modes: ('clip' | 'wrap' | 'overflow')[] = ['overflow', 'wrap'];
    const columns = [col('a', 'text'), col('b', 'multiline_text')];
    expect(reconcileColModes(modes, columns)).toBe(modes);
  });
});

describe('colModeMenuItems', () => {
  it('3 つの選択肢を返し、現在モードに check を付ける', () => {
    const items = colModeMenuItems('wrap');
    expect(items.map((i) => i.mode)).toEqual(COL_OVERFLOW_MODES);
    expect(items.every((i) => typeof i.label === 'string' && i.label.length > 0)).toBe(true);
    const checked = items.filter((i) => i.checked);
    expect(checked).toHaveLength(1);
    expect(checked[0]?.mode).toBe('wrap');
  });

  it('モードごとにラベルが異なる', () => {
    const labels = colModeMenuItems('clip').map((i) => i.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});
