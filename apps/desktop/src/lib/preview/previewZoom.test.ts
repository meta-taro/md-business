import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ZOOM,
  MAX_ZOOM,
  MIN_ZOOM,
  formatZoom,
  parseStoredZoom,
  zoomIn,
  zoomOut,
} from './previewZoom';

describe('zoomIn / zoomOut', () => {
  it('100% から 1 段ずつ上げ下げする', () => {
    expect(zoomIn(1)).toBe(1.1);
    expect(zoomOut(1)).toBe(0.9);
  });

  it('上限・下限で止まる', () => {
    expect(zoomIn(MAX_ZOOM)).toBe(MAX_ZOOM);
    expect(zoomOut(MIN_ZOOM)).toBe(MIN_ZOOM);
  });

  it('段の間の値からは、向かう側の次の段へ寄せる', () => {
    expect(zoomIn(1.05)).toBe(1.1);
    expect(zoomOut(1.05)).toBe(1);
  });
});

describe('parseStoredZoom', () => {
  it('範囲内の数はそのまま使う', () => {
    expect(parseStoredZoom('1.5')).toBe(1.5);
  });

  it('読めない値・範囲外は既定へ戻す', () => {
    expect(parseStoredZoom(null)).toBe(DEFAULT_ZOOM);
    expect(parseStoredZoom('abc')).toBe(DEFAULT_ZOOM);
    expect(parseStoredZoom('0')).toBe(DEFAULT_ZOOM);
    expect(parseStoredZoom('100')).toBe(DEFAULT_ZOOM);
  });
});

describe('formatZoom', () => {
  it('百分率の整数で出す', () => {
    expect(formatZoom(1)).toBe('100%');
    expect(formatZoom(0.67)).toBe('67%');
    expect(formatZoom(1.25)).toBe('125%');
  });
});
