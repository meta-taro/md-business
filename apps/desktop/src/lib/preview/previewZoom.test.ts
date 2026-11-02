import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ZOOM,
  matchZoomShortcut,
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

describe('matchZoomShortcut — 表示倍率', () => {
  const ev = (key: string, extra: Partial<Parameters<typeof matchZoomShortcut>[0]> = {}) => ({
    key,
    ctrlKey: true,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    ...extra,
  });

  it('Ctrl + = / + / ; で拡大（日本語配列の Ctrl+; と Shift 付きの + も受ける）', () => {
    expect(matchZoomShortcut(ev('='))).toBe('zoomIn');
    expect(matchZoomShortcut(ev('+', { shiftKey: true }))).toBe('zoomIn');
    expect(matchZoomShortcut(ev(';'))).toBe('zoomIn');
  });

  it('Ctrl + - で縮小、Ctrl + 0 で 100%', () => {
    expect(matchZoomShortcut(ev('-'))).toBe('zoomOut');
    expect(matchZoomShortcut(ev('0'))).toBe('zoomReset');
  });

  it('Cmd でも同じ。修飾なし・Alt 併用は当てない', () => {
    expect(matchZoomShortcut(ev('-', { ctrlKey: false, metaKey: true }))).toBe('zoomOut');
    expect(matchZoomShortcut(ev('-', { ctrlKey: false }))).toBeNull();
    expect(matchZoomShortcut(ev('-', { altKey: true }))).toBeNull();
    expect(matchZoomShortcut(ev('a'))).toBeNull();
  });
});
