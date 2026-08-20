import { describe, expect, it } from 'vitest';
import { fontFamilies, missingFonts, styleBlocks } from './fontGuard';

describe('使う字を数え上げる', () => {
  it('指定された字の名前を返す', () => {
    expect(fontFamilies('body { font-family: "Noto Sans JP", sans-serif; }')).toEqual([
      'Noto Sans JP',
    ]);
  });

  it('引用符が無くても読む', () => {
    expect(fontFamilies('h1 { font-family: Zen Maru Gothic, serif }')).toEqual(['Zen Maru Gothic']);
  });

  it('総称の名前は数えない', () => {
    // これらは「どれか手元のもの」を指すので、無いということが起きない。
    const css =
      'a { font-family: sans-serif } b { font-family: monospace } c { font-family: system-ui }';
    expect(fontFamilies(css)).toEqual([]);
  });

  it('同じ名前は 1 つに畳む', () => {
    const css = 'a { font-family: "Inter" } b { font-family: Inter, sans-serif }';
    expect(fontFamilies(css)).toEqual(['Inter']);
  });

  it('変数で書かれていれば追えないので数えない', () => {
    expect(fontFamilies('a { font-family: var(--body-font) }')).toEqual([]);
  });

  it('継承の指定は数えない', () => {
    expect(fontFamilies('a { font-family: inherit } b { font-family: initial }')).toEqual([]);
  });

  it('指定が無ければ空', () => {
    expect(fontFamilies('body { color: red }')).toEqual([]);
    expect(fontFamilies('')).toEqual([]);
  });
});

describe('手元に無い字を挙げる', () => {
  it('無いものだけを返す', () => {
    const check = (family: string): boolean => family === 'Inter';
    expect(missingFonts(['Inter', 'Zen Maru Gothic'], check)).toEqual(['Zen Maru Gothic']);
  });

  it('全部あれば空', () => {
    expect(missingFonts(['Inter'], () => true)).toEqual([]);
  });

  it('確かめる術が無ければ何も言わない', () => {
    // 判定できないことを「無い」として断ると、撮れるものまで止まる。
    expect(missingFonts(['Inter'], null)).toEqual([]);
  });
});

describe('書き出す HTML から字の指定だけを取り出す', () => {
  it('style の中だけを見る', () => {
    const html = '<style>body { font-family: "Noto Sans JP" }</style><p>本文</p>';
    expect(fontFamilies(styleBlocks(html))).toEqual(['Noto Sans JP']);
  });

  it('style が複数あれば全部見る', () => {
    const html = '<style>a{font-family:Inter}</style><style>b{font-family:Zen Maru Gothic}</style>';
    expect(fontFamilies(styleBlocks(html))).toEqual(['Inter', 'Zen Maru Gothic']);
  });

  it('属性に書かれた指定は拾わない', () => {
    // 引用符で閉じる書き方は CSS の区切りと違う。混ぜて読むと、
    // 属性の続きまで字の名前として数えてしまう。
    const html = '<p style="font-family: Inter" data-x="y">本文</p>';
    expect(styleBlocks(html)).toBe('');
  });

  it('style が無ければ空', () => {
    expect(styleBlocks('<p>本文</p>')).toBe('');
  });
});
