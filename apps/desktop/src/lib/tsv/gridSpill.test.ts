import { describe, it, expect } from 'vitest';
import { spillsRight } from './gridSpill';

describe('spillsRight', () => {
  it('右隣が空セルなら突き抜けを許す（スプレ既定）', () => {
    expect(spillsRight(['長い説明テキスト', ''], 0, 2)).toBe(true);
  });

  it('右隣に中身があれば突き抜けない（省略で止める）', () => {
    expect(spillsRight(['長い説明テキスト', '次のセル'], 0, 2)).toBe(false);
  });

  it('自セルが空なら流す中身が無いので突き抜けない', () => {
    expect(spillsRight(['', ''], 0, 2)).toBe(false);
  });

  it('自セルが空白のみなら突き抜けない', () => {
    expect(spillsRight(['   ', ''], 0, 2)).toBe(false);
  });

  it('右隣が空白のみなら空とみなして突き抜ける', () => {
    expect(spillsRight(['本文', '  '], 0, 2)).toBe(true);
  });

  it('末尾列は流す先が無いので突き抜けない', () => {
    expect(spillsRight(['本文', '本文'], 1, 2)).toBe(false);
  });

  it('範囲外の列は突き抜けない', () => {
    expect(spillsRight(['本文'], -1, 1)).toBe(false);
    expect(spillsRight(['本文'], 5, 1)).toBe(false);
  });

  it('右隣セルが未定義（配列が短い）なら空とみなして突き抜ける', () => {
    expect(spillsRight(['本文'], 0, 2)).toBe(true);
  });
});
