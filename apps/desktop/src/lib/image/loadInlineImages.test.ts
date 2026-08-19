import { describe, expect, it, vi } from 'vitest';
import { loadInlineImages } from './loadInlineImages';

const png = 'data:image/png;base64,AAAA';

describe('loadInlineImages', () => {
  it('本文が指している画像を読み、参照のまま引ける表を返す', async () => {
    const read = vi.fn(async () => png);
    const result = await loadInlineImages('![領収書](./a.png)', 'docs/2026-08.md', read);
    expect(read).toHaveBeenCalledWith('docs/a.png');
    expect(result.urls.get('./a.png')).toBe(png);
    expect(result.failures).toEqual([]);
  });

  it('同じ画像を 2 回置いても 1 回しか読まない', async () => {
    const read = vi.fn(async () => png);
    await loadInlineImages('![](a.png)\n\n![](a.png)', 'a.md', read);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('読めなかった画像は理由を残し、ほかはそのまま出す', async () => {
    const read = vi.fn(async (rel: string) => {
      if (rel === 'big.png') throw new Error('画像が大きすぎます');
      return png;
    });
    const result = await loadInlineImages('![](big.png)\n![](ok.png)', 'a.md', read);
    expect(result.urls.get('ok.png')).toBe(png);
    expect(result.urls.has('big.png')).toBe(false);
    expect(result.failures).toEqual([{ ref: 'big.png', message: '画像が大きすぎます' }]);
  });

  // 読み取り側でも拒まれるが、そこまで持って行かない。
  it('開いているフォルダの外を指す参照は読みにいかない', async () => {
    const read = vi.fn(async () => png);
    const result = await loadInlineImages('![](../../a.png)', 'docs/a.md', read);
    expect(read).not.toHaveBeenCalled();
    expect(result.urls.size).toBe(0);
  });

  it('画像を置いていない本文では何も読まない', async () => {
    const read = vi.fn(async () => png);
    const result = await loadInlineImages('# 見出し\n\n本文\n', 'a.md', read);
    expect(read).not.toHaveBeenCalled();
    expect(result.urls.size).toBe(0);
    expect(result.failures).toEqual([]);
  });
});
