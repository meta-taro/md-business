// @vitest-environment jsdom
//
// 無害化は本物を通す（DOMPurify は window を要る）。図を描く側は差し替えて、
// ここでは「いつ・何回描くか」と「通したあと何が残るか」だけを確かめる。

import { describe, expect, it, beforeEach, vi } from 'vitest';
import { renderZumenSvg, _resetZumenCacheForTest } from './renderZumen';

const SVG = '<svg width="120" height="60" viewBox="0 0 120 60"><rect /></svg>';
const SOURCE = 'version: 1\ntitle: 本番構成\nnodes: []\n';

beforeEach(() => {
  _resetZumenCacheForTest();
});

describe('renderZumenSvg', () => {
  it('描き手に本文とテーマを渡し、返った SVG を返す', async () => {
    const draw = vi.fn().mockResolvedValue(SVG);
    const svg = await renderZumenSvg(SOURCE, 'dark', draw);
    expect(draw).toHaveBeenCalledWith(SOURCE, { theme: 'dark' });
    expect(svg).toContain('<svg');
  });

  it('同じ図は 2 回目以降描き直さない', async () => {
    // プレビューは打鍵のたびに本文を組み直す。図 1 つで毎回組版が走ると、
    // 打つそばから待たされる（組版は elkjs を通るので安くない）。
    const draw = vi.fn().mockResolvedValue(SVG);
    await renderZumenSvg(SOURCE, 'light', draw);
    await renderZumenSvg(SOURCE, 'light', draw);
    expect(draw).toHaveBeenCalledTimes(1);
  });

  it('テーマが変われば描き直す', async () => {
    // 書き出した SVG は CSS 変数を使えないので、色は描くときに決まる。
    const draw = vi.fn().mockResolvedValue(SVG);
    await renderZumenSvg(SOURCE, 'light', draw);
    await renderZumenSvg(SOURCE, 'dark', draw);
    expect(draw).toHaveBeenCalledTimes(2);
  });

  it('無害化を通す', async () => {
    const draw = vi.fn().mockResolvedValue(`<svg><script>alert(1)</script><rect /></svg>`);
    const svg = await renderZumenSvg(SOURCE, 'light', draw);
    expect(svg).not.toContain('<script');
    expect(svg).toContain('<rect');
  });

  it('描けなかったら投げ、覚えない', async () => {
    // 失敗を覚えると、書き手が直したあとも同じ理由が出続ける。
    const draw = vi.fn().mockRejectedValueOnce(new Error('nodes が空です')).mockResolvedValue(SVG);
    await expect(renderZumenSvg(SOURCE, 'light', draw)).rejects.toThrow('nodes が空です');
    await expect(renderZumenSvg(SOURCE, 'light', draw)).resolves.toContain('<svg');
    expect(draw).toHaveBeenCalledTimes(2);
  });
});
