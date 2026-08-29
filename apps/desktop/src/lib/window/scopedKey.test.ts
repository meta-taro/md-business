import { describe, it, expect } from 'vitest';
import { scopedKey } from './scopedKey';

describe('窓ごとの保存先', () => {
  it('最初の窓は今までと同じ名前を使う（前回の続きを引き継ぐため）', () => {
    expect(scopedKey('md-business:desktop:last-folder', 'main')).toBe(
      'md-business:desktop:last-folder',
    );
  });

  it('2 つ目以降の窓は名前を分ける', () => {
    expect(scopedKey('md-business:desktop:last-folder', 'w2')).toBe(
      'md-business:desktop:last-folder:w2',
    );
  });

  it('窓が違えば別の名前になる', () => {
    const base = 'md-business:desktop:last-folder';
    expect(scopedKey(base, 'w2')).not.toBe(scopedKey(base, 'w3'));
  });
});
