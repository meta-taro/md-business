import { describe, it, expect } from 'vitest';
import { THEME_NAMES, resolveTheme, themeStyleAttr } from './theme.js';

describe('resolveTheme', () => {
  it('指定なしは「指定なし」として返す（間違い扱いしない）', () => {
    expect(resolveTheme(undefined).kind).toBe('unset');
    expect(resolveTheme('').kind).toBe('unset');
    expect(resolveTheme('   ').kind).toBe('unset');
  });

  it('同梱の名前は色に解決する（前後の空白・大文字小文字は問わない）', () => {
    const resolved = resolveTheme('  RED  ');
    expect(resolved.kind).toBe('preset');
    if (resolved.kind !== 'preset') return;
    expect(resolved.name).toBe('red');
    expect(resolved.color).toBe('#b91c1c');
  });

  it('16 進の色はそのまま受ける（3 桁・6 桁・8 桁）', () => {
    for (const input of ['#abc', '#2a4d7a', '#2a4d7a80']) {
      const resolved = resolveTheme(input);
      expect(resolved.kind).toBe('hex');
      if (resolved.kind !== 'hex') return;
      expect(resolved.color).toBe(input);
    }
  });

  it('知らない名前は「知らない」と返す（黙って既定に落とさない）', () => {
    const resolved = resolveTheme(' みどり ');
    expect(resolved.kind).toBe('unknown');
    if (resolved.kind !== 'unknown') return;
    expect(resolved.input).toBe('みどり');
  });

  it('色の書き方になっていないものも「知らない」', () => {
    expect(resolveTheme('#12').kind).toBe('unknown');
    expect(resolveTheme('rgb(0,0,0)').kind).toBe('unknown');
    // 属性を抜け出す文字が入っていても、色としては通さない。
    expect(resolveTheme('#fff" onload="x').kind).toBe('unknown');
  });

  it('文字列でないものは「指定なし」扱い（型の誤りは検証側が知らせる）', () => {
    expect(resolveTheme(1).kind).toBe('unset');
    expect(resolveTheme(null).kind).toBe('unset');
    expect(resolveTheme({ name: 'red' }).kind).toBe('unset');
  });
});

describe('THEME_NAMES', () => {
  it('選べる名前を並べて出せる（知らせるときに添える）', () => {
    expect(THEME_NAMES).toContain('blue');
    expect(THEME_NAMES).toContain('gray');
    // 名前はすべて解決できる。
    for (const name of THEME_NAMES) {
      expect(resolveTheme(name).kind).toBe('preset');
    }
  });
});

describe('themeStyleAttr', () => {
  it('解決できたときだけ style 属性を返す', () => {
    expect(themeStyleAttr('red')).toBe(' style="--mdb-color-accent:#b91c1c"');
    expect(themeStyleAttr('#abc')).toBe(' style="--mdb-color-accent:#abc"');
  });

  it('指定なし・知らない名前では何も足さない（既定の配色のまま）', () => {
    expect(themeStyleAttr(undefined)).toBe('');
    expect(themeStyleAttr('みどり')).toBe('');
    expect(themeStyleAttr('#fff" onload="x')).toBe('');
  });
});
