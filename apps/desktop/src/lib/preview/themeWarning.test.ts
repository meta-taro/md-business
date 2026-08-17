import { describe, it, expect } from 'vitest';
import { themeWarnings } from './themeWarning';

describe('themeWarnings', () => {
  it('指定なしでは何も言わない（指定していないものを間違い扱いしない）', () => {
    expect(themeWarnings(undefined)).toEqual([]);
    expect(themeWarnings('')).toEqual([]);
    expect(themeWarnings('   ')).toEqual([]);
  });

  it('選べる名前・16 進の色では何も言わない', () => {
    expect(themeWarnings('blue')).toEqual([]);
    expect(themeWarnings('#2a4d7a')).toEqual([]);
  });

  it('読めない指定は、落としたことと書き方を知らせる', () => {
    const [message, ...rest] = themeWarnings('みどり');
    expect(rest).toEqual([]);
    expect(message).toContain('みどり');
    // 何が起きたか（既定で描いた）と、どう書けばよいかの両方を出す。
    expect(message).toContain('既定');
    expect(message).toContain('青');
    expect(message).toContain('#');
  });

  it('長い指定は切り詰めて出す（警告欄を 1 件で埋めない）', () => {
    const [message] = themeWarnings('あ'.repeat(200));
    expect(message.length).toBeLessThan(160);
    expect(message).toContain('…');
  });

  it('文字列でないものは検証側に任せて重ねて言わない', () => {
    expect(themeWarnings(42)).toEqual([]);
    expect(themeWarnings(null)).toEqual([]);
  });
});
