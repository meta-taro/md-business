import { describe, it, expect } from 'vitest';

import { WINDOW_CONTROLS, maximizeGlyph, maximizeLabel } from './titlebar';

describe('WINDOW_CONTROLS', () => {
  it('Windows 慣習の順序（最小化 → 最大化 → 閉じる）で 3 つ定義する', () => {
    expect(WINDOW_CONTROLS.map((c) => c.id)).toEqual(['minimize', 'maximize', 'close']);
  });

  it('各コントロールは日本語ラベルとグリフを持つ', () => {
    for (const c of WINDOW_CONTROLS) {
      expect(c.label.length).toBeGreaterThan(0);
      expect(c.glyph.length).toBeGreaterThan(0);
    }
  });
});

describe('maximizeGlyph / maximizeLabel（最大化ボタンは状態でグリフ・ラベルが変わる）', () => {
  it('最大化状態と非最大化状態でグリフが変わる', () => {
    expect(maximizeGlyph(true)).not.toBe(maximizeGlyph(false));
  });

  it('最大化状態と非最大化状態でラベルが変わる', () => {
    expect(maximizeLabel(true)).not.toBe(maximizeLabel(false));
  });

  it('非最大化時のラベル/グリフは WINDOW_CONTROLS の maximize 既定と一致（真実は一箇所）', () => {
    const max = WINDOW_CONTROLS.find((c) => c.id === 'maximize');
    expect(max).toBeDefined();
    expect(maximizeLabel(false)).toBe(max?.label);
    expect(maximizeGlyph(false)).toBe(max?.glyph);
  });
});
