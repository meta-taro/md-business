import { describe, expect, it, vi } from 'vitest';
import { loadAbcImages } from '../../src/abc/abcBlocks.js';

/** SVG から data URL を戻して中身を見る。 */
function decode(markup: string): string {
  const found = /\(data:image\/svg\+xml;base64,([^)\s]+)/.exec(markup);
  if (found === null) throw new Error(`画像になっていない: ${markup}`);
  return atob(found[1]);
}

const SVG = '<svg width="300" height="80" viewBox="0 0 300 80"><path /></svg>';
const TUNE = ['X:1', 'T:Twinkle', 'M:4/4', 'L:1/4', 'K:C', 'C C G G | A A G2 |'].join('\n');

describe('loadAbcImages', () => {
  const describeFailure = (message: string) => `楽譜を描けませんでした（${message}）`;

  it('囲みを画像の記法へ替える', async () => {
    const source = ['# 練習曲', '', '```abc', TUNE, '```', ''].join('\n');
    const render = vi.fn().mockResolvedValue(SVG);

    const out = await loadAbcImages(source, { theme: 'light', render, describe: describeFailure });

    expect(out.size).toBe(1);
    const [[raw, replacement]] = [...out];
    expect(raw).toContain('```abc');
    expect(decode(replacement)).toBe(SVG);
    expect(render).toHaveBeenCalledWith(TUNE, 'light');
  });

  it('描けなかったら、理由をその位置に出し、書いた譜面も残す', async () => {
    const source = ['```abc', 'K:C', 'C D E', '```'].join('\n');
    const render = vi.fn().mockRejectedValue(new Error('音符がありません'));

    const out = await loadAbcImages(source, { theme: 'light', render, describe: describeFailure });

    const replacement = [...out.values()][0];
    expect(replacement).toContain('楽譜を描けませんでした（音符がありません）');
    expect(replacement).toContain('```abc');
    expect(replacement).toContain('C D E');
  });

  it('同じ譜面が並んでも描くのは 1 度だけ', async () => {
    const source = ['```abc', TUNE, '```', '', '````abc', TUNE, '````'].join('\n');
    const render = vi.fn().mockResolvedValue(SVG);

    await loadAbcImages(source, { theme: 'light', render, describe: describeFailure });

    expect(render).toHaveBeenCalledTimes(1);
  });

  it('中身の無い囲みには触らない', async () => {
    const render = vi.fn().mockResolvedValue(SVG);

    const out = await loadAbcImages('```abc\n\n```', {
      theme: 'light',
      render,
      describe: describeFailure,
    });

    expect(out.size).toBe(0);
    expect(render).not.toHaveBeenCalled();
  });

  it('囲みが無ければ描き手を呼ばない', async () => {
    const render = vi.fn().mockResolvedValue(SVG);

    const out = await loadAbcImages('# 見出しだけ', {
      theme: 'light',
      render,
      describe: describeFailure,
    });

    expect(out.size).toBe(0);
    expect(render).not.toHaveBeenCalled();
  });

  it('暗いテーマはそのまま描き手へ渡す', async () => {
    const render = vi.fn().mockResolvedValue(SVG);

    await loadAbcImages(['```abc', TUNE, '```'].join('\n'), {
      theme: 'dark',
      render,
      describe: describeFailure,
    });

    expect(render).toHaveBeenCalledWith(TUNE, 'dark');
  });

  it('曲名（T:）を説明にする', async () => {
    // 譜面の 1 行目は `X:1` で、どの曲なのかを何も伝えない。
    const render = vi.fn().mockResolvedValue(SVG);

    const out = await loadAbcImages(['```abc', TUNE, '```'].join('\n'), {
      theme: 'light',
      render,
      describe: describeFailure,
    });

    expect([...out.values()][0]).toMatch(/^!\[Twinkle\]\(/);
  });

  it('曲名が無ければ、いちばん上の行を説明にする', async () => {
    const render = vi.fn().mockResolvedValue(SVG);

    const out = await loadAbcImages(['```abc', 'X:1', 'K:C', 'CDEF|', '```'].join('\n'), {
      theme: 'light',
      render,
      describe: describeFailure,
    });

    expect([...out.values()][0]).toMatch(/^!\[X:1\]\(/);
  });

  it('曲名は譜面の中に描かれるので、図の下の説明には出さない', async () => {
    // 楽譜は曲名を譜面の上に描く。下にも出すと同じ名前が 2 度並ぶ。
    const render = vi.fn().mockResolvedValue(SVG);

    const out = await loadAbcImages(['```abc', TUNE, '```'].join('\n'), {
      theme: 'light',
      render,
      describe: describeFailure,
    });

    expect([...out.values()][0]).not.toContain('"');
  });

  it('大きさが割合で書かれていたら、viewBox の値を実寸として入れる', async () => {
    const render = vi.fn().mockResolvedValue('<svg width="100%" viewBox="0 0 300 80"></svg>');

    const out = await loadAbcImages(['```abc', TUNE, '```'].join('\n'), {
      theme: 'light',
      render,
      describe: describeFailure,
    });

    const svg = decode([...out.values()][0]);
    expect(svg).toContain('width="300"');
    expect(svg).toContain('height="80"');
  });
});
