// テーマ解決の純ロジック（DOM 非依存・vitest でユニットテストする層）。
// 反応状態と localStorage / document への副作用は theme.svelte.ts が担う。

export type Theme = 'light' | 'dark';

/**
 * テーマ永続化に使う localStorage キー。
 * app.html の FOUC 回避インライン初期化スクリプトと同じキーを共有する。
 */
export const THEME_STORAGE_KEY = 'mdb-theme';

/**
 * 起動時の初期テーマを決める。
 * 保存値（localStorage 由来）が有効なら優先し、無ければ OS の配色設定に従う。
 *
 * @param stored localStorage から読んだ生値（未保存なら null）
 * @param prefersDark `prefers-color-scheme: dark` にマッチするか
 */
export function resolveInitialTheme(stored: string | null, prefersDark: boolean): Theme {
  if (stored === 'light' || stored === 'dark') {
    return stored;
  }
  return prefersDark ? 'dark' : 'light';
}

/** 明暗を反転する（対合：二度呼ぶと元に戻る）。 */
export function toggleTheme(current: Theme): Theme {
  return current === 'dark' ? 'light' : 'dark';
}
