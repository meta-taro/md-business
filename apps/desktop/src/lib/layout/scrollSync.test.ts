import { describe, it, expect } from 'vitest';
import { scrollFraction, targetScrollTop } from './scrollSync';

describe('scrollFraction', () => {
  it('先頭は 0', () => {
    expect(scrollFraction(0, 1000, 400)).toBe(0);
  });

  it('末尾（scrollTop = scrollHeight - clientHeight）は 1', () => {
    expect(scrollFraction(600, 1000, 400)).toBe(1);
  });

  it('中間はスクロール可能域に対する割合', () => {
    // max = 1000 - 400 = 600、300/600 = 0.5
    expect(scrollFraction(300, 1000, 400)).toBe(0.5);
  });

  it('内容が枠に収まる（スクロール不能）なら 0', () => {
    expect(scrollFraction(0, 400, 400)).toBe(0);
    expect(scrollFraction(0, 300, 400)).toBe(0);
  });

  it('範囲外の scrollTop は 0..1 にクランプ', () => {
    expect(scrollFraction(-50, 1000, 400)).toBe(0);
    expect(scrollFraction(9999, 1000, 400)).toBe(1);
  });

  it('NaN は 0 に倒す', () => {
    expect(scrollFraction(Number.NaN, 1000, 400)).toBe(0);
  });
});

describe('targetScrollTop', () => {
  it('割合 0 は先頭', () => {
    expect(targetScrollTop(0, 1000, 400)).toBe(0);
  });

  it('割合 1 は末尾（scrollHeight - clientHeight）', () => {
    expect(targetScrollTop(1, 1000, 400)).toBe(600);
  });

  it('割合 0.5 は可能域の半分', () => {
    expect(targetScrollTop(0.5, 1000, 400)).toBe(300);
  });

  it('スクロール不能なら常に 0', () => {
    expect(targetScrollTop(0.5, 400, 400)).toBe(0);
    expect(targetScrollTop(1, 300, 400)).toBe(0);
  });

  it('範囲外の割合はクランプ', () => {
    expect(targetScrollTop(-1, 1000, 400)).toBe(0);
    expect(targetScrollTop(2, 1000, 400)).toBe(600);
  });

  it('scrollFraction とラウンドトリップする', () => {
    const f = scrollFraction(300, 1000, 400);
    expect(targetScrollTop(f, 1000, 400)).toBe(300);
  });
});
