// テーマの反応状態 + 副作用（localStorage 永続化 / DOM 反映）。
// 純ロジックは theme.ts に置き、ここはランと DOM をつなぐ薄い層に留める。
import { resolveInitialTheme, toggleTheme, THEME_STORAGE_KEY, type Theme } from './theme';

let current = $state<Theme>('light');

function readStored(): string | null {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    return null;
  }
}

function persist(theme: Theme): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // localStorage 不可（プライベート等）の環境では永続化を諦める。表示は継続。
  }
}

function applyToDom(theme: Theme): void {
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.theme = theme;
  }
}

function detectPrefersDark(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );
}

export const themeController = {
  /** 現在のテーマ（テンプレートで参照するとラン依存で反応する）。 */
  get value(): Theme {
    return current;
  },

  /**
   * 起動時に localStorage / OS 設定から初期化し DOM を同期する。
   * app.html が paint 前に data-theme を確定済みなので DOM 更新は冪等。
   * ここでは反応状態 current を種づけしてトグルボタンの表示を正しくする。
   */
  init(): void {
    current = resolveInitialTheme(readStored(), detectPrefersDark());
    applyToDom(current);
  },

  /** 明暗を反転し DOM と localStorage に反映する。 */
  toggle(): void {
    current = toggleTheme(current);
    applyToDom(current);
    persist(current);
  },
};
