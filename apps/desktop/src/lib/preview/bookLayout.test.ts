import { describe, it, expect } from 'vitest';
import {
  alignPage,
  bookMetrics,
  pageCount,
  pageLabel,
  pagesPerView,
  turnPage,
} from './bookLayout';

describe('pagesPerView', () => {
  it('横長で広い窓は見開き 2 ページ', () => {
    expect(pagesPerView(1600, 900)).toBe(2);
  });

  it('縦長の窓は 1 ページ', () => {
    expect(pagesPerView(900, 1200)).toBe(1);
  });

  it('狭い窓は横長でも 1 ページ（1 段が細くなりすぎる）', () => {
    expect(pagesPerView(800, 400)).toBe(1);
  });

  it('正方形に近い窓は 1 ページ', () => {
    expect(pagesPerView(1000, 950)).toBe(1);
  });

  it('高さが取れないときは 1 ページ', () => {
    expect(pagesPerView(1600, 0)).toBe(1);
  });
});

describe('bookMetrics', () => {
  it('見開きでは 2 段と綴じ目が窓の幅に収まる', () => {
    const m = bookMetrics(1600, 900);
    expect(m.perView).toBe(2);
    expect(m.padX * 2 + m.pageWidth * 2 + m.gap).toBeCloseTo(1600);
    expect(m.stride).toBeCloseTo(m.pageWidth + m.gap);
  });

  it('1 ページでは段が余白の内側いっぱい', () => {
    const m = bookMetrics(700, 1000);
    expect(m.perView).toBe(1);
    expect(m.pageWidth).toBeCloseTo(700 - m.padX * 2);
  });

  it('狭い窓は余白を詰める', () => {
    expect(bookMetrics(400, 800).padX).toBeLessThan(
      bookMetrics(1000, 1400).padX
    );
  });
});

describe('pageCount', () => {
  const m = bookMetrics(1600, 900);

  it('段の数を数える（右の余白を含んでも含まなくても同じ）', () => {
    const fiveColumns = m.padX + m.pageWidth * 5 + m.gap * 4;
    expect(pageCount(fiveColumns, m)).toBe(5);
    expect(pageCount(fiveColumns + m.padX, m)).toBe(5);
  });

  it('本文が空でも 1 ページはある', () => {
    expect(pageCount(0, m)).toBe(1);
  });
});

describe('alignPage', () => {
  it('見開きでは偶数ページから始める', () => {
    expect(alignPage(3, 2, 10)).toBe(2);
    expect(alignPage(4, 2, 10)).toBe(4);
  });

  it('範囲の外は端へ寄せる', () => {
    expect(alignPage(-3, 2, 10)).toBe(0);
    expect(alignPage(99, 2, 10)).toBe(8);
    expect(alignPage(99, 1, 10)).toBe(9);
  });

  it('奇数ページの本でも最後の画面へ行ける', () => {
    expect(alignPage(99, 2, 9)).toBe(8);
  });
});

describe('turnPage', () => {
  it('1 画面ぶん進む・戻る', () => {
    expect(turnPage(0, 1, 2, 10)).toBe(2);
    expect(turnPage(4, -1, 2, 10)).toBe(2);
    expect(turnPage(4, 1, 1, 10)).toBe(5);
  });

  it('端では止まる', () => {
    expect(turnPage(0, -1, 2, 10)).toBe(0);
    expect(turnPage(8, 1, 2, 10)).toBe(8);
  });

  it('1 ページ表示で読んでいた奇数ページから見開きにしても、そのページを含む組から進む', () => {
    expect(turnPage(5, 1, 2, 10)).toBe(6);
  });
});

describe('pageLabel', () => {
  it('見開きは範囲で出す', () => {
    expect(pageLabel(2, 2, 10)).toBe('3–4 / 10');
  });

  it('右側が無い最後の画面と 1 ページ表示は 1 つだけ', () => {
    expect(pageLabel(8, 2, 9)).toBe('9 / 9');
    expect(pageLabel(4, 1, 9)).toBe('5 / 9');
  });
});
