import { describe, it, expect } from 'vitest';
import { bubbleAnchor, bubblePlacement, bubbleShowMs } from './placement';

const view = { width: 1000, height: 700 };
const size = { width: 200, height: 40 };

describe('bubblePlacement', () => {
  it('上に入るなら上に出し、しっぽを対象へ向ける', () => {
    const target = { left: 300, top: 300, right: 400, bottom: 330 };
    const p = bubblePlacement(target, bubbleAnchor(target), size, view);
    expect(p.side).toBe('above');
    expect(p.top).toBe(300 - 10 - 40);
    expect(p.left + p.tail).toBe(bubbleAnchor(target).x);
  });

  it('上が窓の端に当たるなら下に出す', () => {
    const target = { left: 300, top: 20, right: 400, bottom: 50 };
    const p = bubblePlacement(target, bubbleAnchor(target), size, view);
    expect(p.side).toBe('below');
    expect(p.top).toBe(60);
  });

  it('上下とも入らなければ横に出し、窓から 8px 以上はみ出さない', () => {
    const target = { left: 20, top: 30, right: 120, bottom: 680 };
    const p = bubblePlacement(target, bubbleAnchor(target), size, view);
    expect(p.side).toBe('right');
    expect(p.left).toBe(130);
    expect(p.top).toBeGreaterThanOrEqual(8);
    expect(p.top + size.height).toBeLessThanOrEqual(view.height - 8);
  });

  it('右端の対象では吹き出しを窓の内側へ寄せる', () => {
    const target = { left: 950, top: 300, right: 995, bottom: 330 };
    const p = bubblePlacement(target, bubbleAnchor(target), size, view);
    expect(p.left + size.width).toBeLessThanOrEqual(view.width - 8);
    // 寄せてもしっぽは吹き出しの角を突き抜けない。
    expect(p.tail).toBeLessThanOrEqual(size.width - 14);
  });
});

describe('bubbleShowMs', () => {
  it('秒数の指定があればそれに従う', () => {
    expect(bubbleShowMs('あ', 3)).toBe(3000);
  });
  it('言葉が無ければ短く出す', () => {
    expect(bubbleShowMs(undefined)).toBe(2600);
  });
  it('長い文ほど長く出すが 20 秒で止める', () => {
    expect(bubbleShowMs('あいう')).toBe(5300);
    expect(bubbleShowMs('あ'.repeat(400))).toBe(20000);
  });
});
