import { describe, expect, it } from 'vitest';
import { resolveInitialTheme, toggleTheme, THEME_STORAGE_KEY } from './theme';

describe('resolveInitialTheme', () => {
  it('保存値が light ならそのまま light を返す', () => {
    expect(resolveInitialTheme('light', true)).toBe('light');
    expect(resolveInitialTheme('light', false)).toBe('light');
  });

  it('保存値が dark ならそのまま dark を返す', () => {
    expect(resolveInitialTheme('dark', false)).toBe('dark');
    expect(resolveInitialTheme('dark', true)).toBe('dark');
  });

  it('保存値が無い（null）ときは OS 設定に従う', () => {
    expect(resolveInitialTheme(null, true)).toBe('dark');
    expect(resolveInitialTheme(null, false)).toBe('light');
  });

  it('保存値が不正な文字列のときも OS 設定にフォールバックする', () => {
    expect(resolveInitialTheme('sepia', true)).toBe('dark');
    expect(resolveInitialTheme('', false)).toBe('light');
    expect(resolveInitialTheme('DARK', false)).toBe('light');
  });
});

describe('toggleTheme', () => {
  it('light ↔ dark を反転する', () => {
    expect(toggleTheme('light')).toBe('dark');
    expect(toggleTheme('dark')).toBe('light');
  });

  it('二度呼ぶと元に戻る（対合）', () => {
    expect(toggleTheme(toggleTheme('light'))).toBe('light');
    expect(toggleTheme(toggleTheme('dark'))).toBe('dark');
  });
});

describe('THEME_STORAGE_KEY', () => {
  it('app.html の FOUC 回避スクリプトと同じ localStorage キーを使う', () => {
    // app.html 側の初期化スクリプトが読む 'mdb-theme' と一致していないと、
    // リロード時に一瞬別テーマが描画される（FOUC）ので固定契約とする。
    expect(THEME_STORAGE_KEY).toBe('mdb-theme');
  });
});
