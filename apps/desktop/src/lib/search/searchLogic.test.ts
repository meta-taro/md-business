import { describe, it, expect } from 'vitest';
import {
  escapeRegExp,
  buildSearchRegex,
  findMatches,
  countMatches,
  stepMatchIndex,
  displayIndex,
  DEFAULT_SEARCH_OPTIONS,
  type SearchOptions,
} from './searchLogic';

const opts = (over: Partial<SearchOptions> = {}): SearchOptions => ({
  ...DEFAULT_SEARCH_OPTIONS,
  ...over,
});

describe('escapeRegExp', () => {
  it('正規表現メタ文字をエスケープする', () => {
    expect(escapeRegExp('a.b*c')).toBe('a\\.b\\*c');
    expect(escapeRegExp('(x)[y]')).toBe('\\(x\\)\\[y\\]');
  });
});

describe('buildSearchRegex', () => {
  it('空クエリは null', () => {
    expect(buildSearchRegex('', opts())).toBeNull();
  });

  it('リテラル（regex=false）はメタ文字をエスケープして一致させる', () => {
    const re = buildSearchRegex('a.b', opts());
    expect(re).not.toBeNull();
    expect('a.b'.match(re!)).not.toBeNull();
    expect('axb'.match(re!)).toBeNull(); // . はリテラルなので axb は不一致
  });

  it('caseSensitive=false は大文字小文字を無視する', () => {
    expect('HELLO'.match(buildSearchRegex('hello', opts())!)).not.toBeNull();
    expect('HELLO'.match(buildSearchRegex('hello', opts({ caseSensitive: true }))!)).toBeNull();
  });

  it('wholeWord は単語境界で挟む', () => {
    const re = buildSearchRegex('cat', opts({ wholeWord: true }));
    expect('a cat sat'.match(re!)).not.toBeNull();
    expect('category'.match(re!)).toBeNull(); // 部分語は不一致
  });

  it('regex=true は生パターン、不正パターンは null', () => {
    expect('a1b2'.match(buildSearchRegex('\\d', opts({ regex: true }))!)).not.toBeNull();
    expect(buildSearchRegex('(unclosed', opts({ regex: true }))).toBeNull();
  });
});

describe('findMatches', () => {
  it('各マッチの開始・終了オフセットを列挙する', () => {
    expect(findMatches('ababab', buildSearchRegex('ab', opts()))).toEqual([
      { start: 0, end: 2 },
      { start: 2, end: 4 },
      { start: 4, end: 6 },
    ]);
  });

  it('マッチ無しは空配列', () => {
    expect(findMatches('no hits', buildSearchRegex('xyz', opts()))).toEqual([]);
  });

  it('null 正規表現は空配列', () => {
    expect(findMatches('anything', null)).toEqual([]);
  });

  it('空マッチになりうるパターンで無限ループしない（有限個を返す）', () => {
    const ms = findMatches('aaa', buildSearchRegex('a*', opts({ regex: true })));
    expect(Array.isArray(ms)).toBe(true);
    expect(ms.length).toBeGreaterThan(0);
  });
});

describe('countMatches', () => {
  it('非重複マッチ数を数える', () => {
    expect(countMatches('ababab', buildSearchRegex('ab', opts()))).toBe(3);
    expect(countMatches('no hits', buildSearchRegex('xyz', opts()))).toBe(0);
  });

  it('null 正規表現は 0', () => {
    expect(countMatches('anything', null)).toBe(0);
  });

  it('空マッチになりうるパターンで無限ループしない', () => {
    // a* は各位置で空マッチしうる。停止して有限を返せること（値の厳密さより停止性を検証）。
    const n = countMatches('aaa', buildSearchRegex('a*', opts({ regex: true })));
    expect(Number.isFinite(n)).toBe(true);
    expect(n).toBeGreaterThan(0);
  });
});

describe('stepMatchIndex', () => {
  it('未選択(-1)からの次へ/前へ', () => {
    expect(stepMatchIndex(-1, 3, 1)).toBe(0);
    expect(stepMatchIndex(-1, 3, -1)).toBe(2);
  });

  it('末尾から次へは先頭へ巻き戻る（ラップ）', () => {
    expect(stepMatchIndex(2, 3, 1)).toBe(0);
  });

  it('先頭から前へは末尾へ巻き戻る（ラップ）', () => {
    expect(stepMatchIndex(0, 3, -1)).toBe(2);
  });

  it('total 0 は -1', () => {
    expect(stepMatchIndex(-1, 0, 1)).toBe(-1);
  });
});

describe('displayIndex', () => {
  it('0 始まりを 1 始まりへ、マッチ無しは 0', () => {
    expect(displayIndex(0, 3)).toBe(1);
    expect(displayIndex(2, 3)).toBe(3);
    expect(displayIndex(-1, 3)).toBe(0);
    expect(displayIndex(0, 0)).toBe(0);
  });
});
