import { describe, it, expect } from 'vitest';
import { diffEdit } from './textDiff';

describe('diffEdit', () => {
  it('同じなら差し替えるものが無い', () => {
    expect(diffEdit('abc', 'abc')).toBeNull();
  });

  it('末尾に足した', () => {
    expect(diffEdit('abc', 'abcd')).toEqual({ from: 3, to: 3, insert: 'd' });
  });

  it('先頭に足した', () => {
    expect(diffEdit('abc', 'zabc')).toEqual({ from: 0, to: 0, insert: 'z' });
  });

  it('途中を置き換えた', () => {
    expect(diffEdit('abc', 'axc')).toEqual({ from: 1, to: 2, insert: 'x' });
  });

  it('途中を消した', () => {
    expect(diffEdit('abcd', 'ad')).toEqual({ from: 1, to: 3, insert: '' });
  });

  it('全部消した', () => {
    expect(diffEdit('abc', '')).toEqual({ from: 0, to: 3, insert: '' });
  });

  it('空から足した', () => {
    expect(diffEdit('', 'abc')).toEqual({ from: 0, to: 0, insert: 'abc' });
  });

  it('同じ文字が続いていても範囲が重ならない', () => {
    // 前後から詰めると重なりうる。重なると to < from の壊れた範囲になる。
    expect(diffEdit('aaa', 'aaaa')).toEqual({ from: 3, to: 3, insert: 'a' });
    expect(diffEdit('aaaa', 'aaa')).toEqual({ from: 3, to: 4, insert: '' });
  });

  it('セル 1 つぶんの書き換えは、その 1 語だけの差になる', () => {
    const before = 'TC-001\t未実施\t備考\nTC-002\t未実施\t備考\n';
    const after = 'TC-001\t合格\t備考\nTC-002\t未実施\t備考\n';
    const edit = diffEdit(before, after);
    expect(edit).not.toBeNull();
    // 変わっていない 2 行目まで巻き込まない。
    expect(edit!.to).toBeLessThan(before.indexOf('TC-002'));
  });

  it('当てると必ず後の文字列になる', () => {
    const cases: Array<[string, string]> = [
      ['', ''],
      ['a', ''],
      ['', 'a'],
      ['abc', 'abd'],
      ['line1\nline2\n', 'line1\nline2 changed\n'],
      ['xyz', 'xy'],
    ];
    for (const [before, after] of cases) {
      const edit = diffEdit(before, after);
      const applied =
        edit === null ? before : before.slice(0, edit.from) + edit.insert + before.slice(edit.to);
      expect(applied).toBe(after);
    }
  });

  it('サロゲートペアを割らない', () => {
    // 絵文字は 2 単位で 1 文字。境界を単位の途中に置くと壊れた文字ができる。
    const edit = diffEdit('a😀b', 'a😁b');
    expect(edit).not.toBeNull();
    expect(edit!.from % 1).toBe(0);
    const applied = 'a😀b'.slice(0, edit!.from) + edit!.insert + 'a😀b'.slice(edit!.to);
    expect(applied).toBe('a😁b');
    expect([...applied]).toHaveLength(3);
  });
});
