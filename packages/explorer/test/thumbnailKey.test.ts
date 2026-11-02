import { describe, expect, it } from 'vitest';
import { contentHash, thumbnailKey } from '../src/thumbnailKey.js';

describe('contentHash', () => {
  it('同じ中身は同じ値、違う中身は違う値', () => {
    expect(contentHash('a')).toBe(contentHash('a'));
    expect(contentHash('a')).not.toBe(contentHash('b'));
  });
  it('バイト列も受け付け、同じ中身の文字列と同じ値になる', () => {
    expect(contentHash(new TextEncoder().encode('構成図'))).toBe(contentHash('構成図'));
  });
});

describe('thumbnailKey', () => {
  const base = { kind: 'zumen', hash: 'abc', renderer: 'zumen@0.3.3', theme: 'light' } as const;
  it('描画の版が変われば鍵も変わる（版上げで古い絵を出さない）', () => {
    expect(thumbnailKey(base)).not.toBe(thumbnailKey({ ...base, renderer: 'zumen@0.7.0' }));
  });
  it('配色が変われば鍵も変わる', () => {
    expect(thumbnailKey(base)).not.toBe(thumbnailKey({ ...base, theme: 'dark' }));
  });
  it('同じ入力なら同じ鍵', () => {
    expect(thumbnailKey(base)).toBe(thumbnailKey({ ...base }));
  });
});
