import { describe, it, expect, vi } from 'vitest';
import { previewVisible, previewReady, type PaneState } from './previewGate';

function pane(over: Partial<PaneState> = {}): PaneState {
  return { diff: false, data: false, grid: false, timeline: false, ...over };
}

describe('previewVisible', () => {
  it('ほかを何も出していなければプレビューが出る', () => {
    expect(previewVisible(pane())).toBe(true);
  });

  it('差分・参考データ・検証グリッド・時系列のどれかが出ていればプレビューは出ない', () => {
    expect(previewVisible(pane({ diff: true }))).toBe(false);
    expect(previewVisible(pane({ data: true }))).toBe(false);
    expect(previewVisible(pane({ grid: true }))).toBe(false);
    expect(previewVisible(pane({ timeline: true }))).toBe(false);
  });
});

describe('previewReady', () => {
  it('出ているときは組み上がりを確かめて返す', () => {
    expect(previewReady(pane(), () => true)).toBe(true);
    expect(previewReady(pane(), () => false)).toBe(false);
  });

  // 確かめること自体が本文全体の組み直しになる。画面に無いときに確かめると、
  // 1 セル確定するたびに捨てるためだけの組み直しが走る（2,000 行で 170ms）。
  it('出していないときは組み上がりを確かめない', () => {
    const isOk = vi.fn(() => true);
    expect(previewReady(pane({ grid: true }), isOk)).toBe(false);
    expect(previewReady(pane({ data: true }), isOk)).toBe(false);
    expect(previewReady(pane({ diff: true }), isOk)).toBe(false);
    expect(previewReady(pane({ timeline: true }), isOk)).toBe(false);
    expect(isOk).not.toHaveBeenCalled();
  });
});
