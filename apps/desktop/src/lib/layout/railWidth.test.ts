import { describe, it, expect } from 'vitest';
import {
  DEFAULT_FILETREE_W,
  MIN_FILETREE_W,
  MAX_FILETREE_W,
  clampWidth,
  widthFromPointer,
  parseStoredWidth,
  stepWidth,
} from './railWidth';

describe('clampWidth', () => {
  it('範囲内はそのまま返す', () => {
    expect(clampWidth(300)).toBe(300);
  });

  it('下限未満は下限に丸める', () => {
    expect(clampWidth(MIN_FILETREE_W - 50)).toBe(MIN_FILETREE_W);
  });

  it('上限超過は上限に丸める', () => {
    expect(clampWidth(MAX_FILETREE_W + 200)).toBe(MAX_FILETREE_W);
  });

  it('非数は既定幅にフォールバックする', () => {
    expect(clampWidth(Number.NaN)).toBe(DEFAULT_FILETREE_W);
    expect(clampWidth(Number.POSITIVE_INFINITY)).toBe(DEFAULT_FILETREE_W);
  });
});

describe('widthFromPointer', () => {
  it('レール左端からの相対 X を幅として返す', () => {
    // railLeft=100, pointerX=420 → 320px（範囲内）
    expect(widthFromPointer(420, 100)).toBe(320);
  });

  it('外側へ引いても下限・上限でクランプする', () => {
    expect(widthFromPointer(120, 100)).toBe(MIN_FILETREE_W); // 20px → 下限
    expect(widthFromPointer(9999, 100)).toBe(MAX_FILETREE_W);
  });
});

describe('parseStoredWidth', () => {
  it('null / 空文字は既定幅', () => {
    expect(parseStoredWidth(null)).toBe(DEFAULT_FILETREE_W);
    expect(parseStoredWidth('')).toBe(DEFAULT_FILETREE_W);
  });

  it('数値文字列は範囲クランプして返す', () => {
    expect(parseStoredWidth('300')).toBe(300);
    expect(parseStoredWidth('50')).toBe(MIN_FILETREE_W);
    expect(parseStoredWidth('9999')).toBe(MAX_FILETREE_W);
  });

  it('非数は既定幅', () => {
    expect(parseStoredWidth('abc')).toBe(DEFAULT_FILETREE_W);
  });
});

describe('stepWidth', () => {
  it('方向 +1 で広げ、-1 で狭める', () => {
    expect(stepWidth(300, 1, 24)).toBe(324);
    expect(stepWidth(300, -1, 24)).toBe(276);
  });

  it('クランプ範囲を超えない', () => {
    expect(stepWidth(MAX_FILETREE_W, 1, 24)).toBe(MAX_FILETREE_W);
    expect(stepWidth(MIN_FILETREE_W, -1, 24)).toBe(MIN_FILETREE_W);
  });
});
