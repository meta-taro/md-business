import { describe, it, expect } from 'vitest';
import type { CellRange } from './gridRange';
import { marqueeEdges, NO_EDGES } from './gridMarquee';

const range = (r0: number, c0: number, r1: number, c1: number): CellRange => ({
  anchor: { row: r0, col: c0 },
  focus: { row: r1, col: c1 },
});

describe('marqueeEdges', () => {
  it('控えが無ければどの辺も引かない', () => {
    expect(marqueeEdges(null, 0, 0)).toEqual(NO_EDGES);
  });

  it('範囲の外はどの辺も引かない', () => {
    expect(marqueeEdges(range(1, 1, 2, 2), 0, 1)).toEqual(NO_EDGES);
    expect(marqueeEdges(range(1, 1, 2, 2), 1, 3)).toEqual(NO_EDGES);
  });

  it('1 セルだけなら四辺すべて', () => {
    expect(marqueeEdges(range(2, 3, 2, 3), 2, 3)).toEqual({
      top: true,
      right: true,
      bottom: true,
      left: true,
    });
  });

  it('角のセルは外側の 2 辺だけ', () => {
    const r = range(0, 0, 1, 1);
    expect(marqueeEdges(r, 0, 0)).toEqual({ top: true, right: false, bottom: false, left: true });
    expect(marqueeEdges(r, 0, 1)).toEqual({ top: true, right: true, bottom: false, left: false });
    expect(marqueeEdges(r, 1, 0)).toEqual({ top: false, right: false, bottom: true, left: true });
    expect(marqueeEdges(r, 1, 1)).toEqual({ top: false, right: true, bottom: true, left: false });
  });

  it('内側のセルはどの辺も引かない', () => {
    expect(marqueeEdges(range(0, 0, 2, 2), 1, 1)).toEqual(NO_EDGES);
  });

  it('辺の途中のセルはその 1 辺だけ', () => {
    expect(marqueeEdges(range(0, 0, 2, 2), 0, 1)).toEqual({
      top: true,
      right: false,
      bottom: false,
      left: false,
    });
  });

  it('起点が右下でも同じ枠になる', () => {
    const forward = marqueeEdges(range(0, 0, 1, 1), 0, 0);
    const backward = marqueeEdges(range(1, 1, 0, 0), 0, 0);
    expect(backward).toEqual(forward);
  });
});
