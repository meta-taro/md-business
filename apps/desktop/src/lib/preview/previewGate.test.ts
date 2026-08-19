import { describe, it, expect, vi } from 'vitest';
import {
  previewVisible,
  previewReady,
  shouldRenderPreview,
  type PaneState,
} from './previewGate';

function pane(over: Partial<PaneState> = {}): PaneState {
  return { diff: false, data: false, grid: false, timeline: false, image: false, ...over };
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
    expect(previewVisible(pane({ image: true }))).toBe(false);
  });

  it('画像を開いている間はプレビューを出さない', () => {
    // 画像には本文が無い。出すと、前に開いていた文書の中身が
    // そのまま残っているように見えるし、そのまま PDF へも出せてしまう。
    expect(previewReady(pane({ image: true }), () => true)).toBe(false);
    expect(shouldRenderPreview(pane({ image: true }))).toBe(false);
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

describe('出していない間は組み直さない', () => {
  const shown: PaneState = {
    diff: false,
    data: false,
    grid: false,
    timeline: false,
    image: false,
  };

  it('プレビューを出していれば組み直す', () => {
    expect(shouldRenderPreview(shown)).toBe(true);
  });

  // 一度プレビューを開くと組み立て一式が読み込まれたまま残る。そのあと検証グリッドへ
  // 切り替えると、出していない HTML を 1 打ごとに組み直すことになる（大きなシートでは
  // これだけで打鍵が止まる）。出していない面では組み直さない。
  it('グリッドへ切り替えたら組み直さない', () => {
    expect(shouldRenderPreview({ ...shown, grid: true })).toBe(false);
  });

  it('差分・参考データ・時系列でも組み直さない', () => {
    expect(shouldRenderPreview({ ...shown, diff: true })).toBe(false);
    expect(shouldRenderPreview({ ...shown, data: true })).toBe(false);
    expect(shouldRenderPreview({ ...shown, timeline: true })).toBe(false);
  });
});
