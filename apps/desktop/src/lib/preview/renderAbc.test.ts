// @vitest-environment jsdom
//
// 無害化は本物を通す（DOMPurify は window を要る）。譜面を組む側は差し替えて、
// ここでは「いつ・何回描くか」と「通したあと何が残るか」だけを確かめる。

import { describe, expect, it, beforeEach, vi } from 'vitest';
import { renderAbcSvg, _resetAbcCacheForTest } from './renderAbc';

const SVG = '<svg width="300" height="80" viewBox="0 0 300 80"><path d="M0 0" /></svg>';
const TUNE = ['X:1', 'T:Scale', 'M:4/4', 'L:1/4', 'K:C', 'C D E F | G A B c |'].join('\n');

beforeEach(() => {
  _resetAbcCacheForTest();
});

describe('renderAbcSvg', () => {
  it('描き手に譜面とテーマを渡し、返った SVG を返す', async () => {
    const draw = vi.fn().mockResolvedValue(SVG);
    const svg = await renderAbcSvg(TUNE, 'dark', draw);
    expect(draw).toHaveBeenCalledWith(TUNE, { theme: 'dark' });
    expect(svg).toContain('<svg');
  });

  it('同じ譜面は 2 回目以降描き直さない', async () => {
    // プレビューは打鍵のたびに本文を組み直す。譜面 1 つで毎回組版が走ると、打つそばから待たされる。
    const draw = vi.fn().mockResolvedValue(SVG);
    await renderAbcSvg(TUNE, 'light', draw);
    await renderAbcSvg(TUNE, 'light', draw);
    expect(draw).toHaveBeenCalledTimes(1);
  });

  it('テーマが変われば描き直す', async () => {
    // 書き出した SVG は CSS 変数を使えないので、線の色は描くときに決まる。
    const draw = vi.fn().mockResolvedValue(SVG);
    await renderAbcSvg(TUNE, 'light', draw);
    await renderAbcSvg(TUNE, 'dark', draw);
    expect(draw).toHaveBeenCalledTimes(2);
  });

  it('無害化を通す', async () => {
    const draw = vi.fn().mockResolvedValue('<svg><script>alert(1)</script><path d="M0 0" /></svg>');
    const svg = await renderAbcSvg(TUNE, 'light', draw);
    expect(svg).not.toContain('<script');
    expect(svg).toContain('<path');
  });

  it('描けなかったら投げ、覚えない', async () => {
    // 失敗を覚えると、書き手が直したあとも同じ理由が出続ける。
    const draw = vi.fn().mockRejectedValueOnce(new Error('音符がありません')).mockResolvedValue(SVG);
    await expect(renderAbcSvg(TUNE, 'light', draw)).rejects.toThrow('音符がありません');
    await expect(renderAbcSvg(TUNE, 'light', draw)).resolves.toContain('<svg');
    expect(draw).toHaveBeenCalledTimes(2);
  });
});

describe('renderAbcSvg — 本物の abcjs を通す', () => {
  it('五線と音符が無害化のあとも残る', async () => {
    const svg = await renderAbcSvg(TUNE, 'light');
    expect(svg).toMatch(/^<svg/);
    expect(svg).toContain('<path');
    expect(svg).toMatch(/viewBox="/);
    // data URL の画像は名前空間が無いと描かれない。
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
  });

  it('暗い面では線を明るい色で描く', async () => {
    const svg = await renderAbcSvg(TUNE, 'dark');
    expect(svg).not.toMatch(/(fill|stroke)="(#000000|#000|black)"/);
    // 画像として開くと currentColor は周りを受け継げず黒になる。
    expect(svg).not.toContain('currentColor');
  });

  it('譜面が 1 つも無ければ投げる', async () => {
    // ABC は寛容で、ただの文字でも何かしら描こうとする。何も組めなかったときだけ失敗にする。
    await expect(renderAbcSvg('', 'light')).rejects.toThrow();
  });
});
