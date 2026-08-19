import { describe, expect, it } from 'vitest';
import { createSheetCache } from './sheetCache';

function reader(): { read: (p: string) => Promise<string | null>; calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    read: async (p: string) => {
      calls.push(p);
      return p === 'missing.tsv' ? null : `body of ${p}`;
    },
  };
}

describe('参照先シートの控え', () => {
  it('同じ相手は 1 度しか読まない', async () => {
    const base = reader();
    const cache = createSheetCache(base.read, { now: () => 0 });
    expect(await cache.read('a.tsv')).toBe('body of a.tsv');
    expect(await cache.read('a.tsv')).toBe('body of a.tsv');
    expect(base.calls).toEqual(['a.tsv']);
  });

  it('相手が違えばそれぞれ読む', async () => {
    const base = reader();
    const cache = createSheetCache(base.read, { now: () => 0 });
    await cache.read('a.tsv');
    await cache.read('b.tsv');
    expect(base.calls).toEqual(['a.tsv', 'b.tsv']);
  });

  // 読めなかったことも控える。控えないと、置いていないファイルを指しているシートは
  // 打鍵のたびに空振りの読み取りを投げ続ける。
  it('読めなかったことも控える', async () => {
    const base = reader();
    const cache = createSheetCache(base.read, { now: () => 0 });
    expect(await cache.read('missing.tsv')).toBeNull();
    expect(await cache.read('missing.tsv')).toBeNull();
    expect(base.calls).toEqual(['missing.tsv']);
  });

  // 同時に投げられた読み取りは 1 本にまとめる。3 つの照合が同じ相手を指していると、
  // まとめないと 1 打で同じファイルを 3 回読むことになる。
  it('同時に投げても 1 本にまとまる', async () => {
    const base = reader();
    const cache = createSheetCache(base.read, { now: () => 0 });
    const [x, y, z] = await Promise.all([
      cache.read('a.tsv'),
      cache.read('a.tsv'),
      cache.read('a.tsv'),
    ]);
    expect([x, y, z]).toEqual(['body of a.tsv', 'body of a.tsv', 'body of a.tsv']);
    expect(base.calls).toEqual(['a.tsv']);
  });

  // 相手が別のところで書き換わっても気づけないので、控えは持ち続けない。
  it('期限を過ぎたら読み直す', async () => {
    const base = reader();
    let clock = 0;
    const cache = createSheetCache(base.read, { now: () => clock, ttlMs: 2000 });
    await cache.read('a.tsv');
    clock = 1999;
    await cache.read('a.tsv');
    expect(base.calls).toEqual(['a.tsv']);
    clock = 2000;
    await cache.read('a.tsv');
    expect(base.calls).toEqual(['a.tsv', 'a.tsv']);
  });

  it('捨てれば読み直す', async () => {
    const base = reader();
    const cache = createSheetCache(base.read, { now: () => 0 });
    await cache.read('a.tsv');
    cache.clear();
    await cache.read('a.tsv');
    expect(base.calls).toEqual(['a.tsv', 'a.tsv']);
  });
});
