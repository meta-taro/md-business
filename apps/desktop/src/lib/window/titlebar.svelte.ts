// 自作タイトルバーの反応状態 + 副作用（Tauri ウィンドウ IPC）。
// 純ロジックは titlebar.ts に置き、ここは runes と Tauri をつなぐ薄い層に留める。
// ブラウザ実行時（vite dev を Tauri 外で開いた場合）は静かに no-op し、表示のみ維持する。
import { maximizeGlyph, maximizeLabel } from './titlebar';

let maximized = $state(false);

function inTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

// 遅延 import：ブラウザ実行時は Tauri API モジュールに触れない。
async function appWindow() {
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  return getCurrentWindow();
}

export const titlebarController = {
  /** 最大化中か（テンプレートで参照するとラン依存で反応する）。 */
  get isMaximized(): boolean {
    return maximized;
  },

  /** 最大化ボタンのグリフ（状態依存）。 */
  get maxGlyph(): string {
    return maximizeGlyph(maximized);
  },

  /** 最大化ボタンのラベル（状態依存）。 */
  get maxLabel(): string {
    return maximizeLabel(maximized);
  },

  /** 起動時に現在の最大化状態を取り込み、リサイズ追従を張る。 */
  async init(): Promise<void> {
    if (!inTauri()) return;
    try {
      const w = await appWindow();
      maximized = await w.isMaximized();
      await w.onResized(async () => {
        try {
          maximized = await w.isMaximized();
        } catch {
          // 権限なし等では最大化状態の追従を諦める（表示のみ影響）。
        }
      });
    } catch {
      // Tauri API 不可＝ブラウザ実行。タイトルバーは表示のみで機能させない。
    }
  },

  /** ウィンドウを最小化する。 */
  async minimize(): Promise<void> {
    if (!inTauri()) return;
    try {
      await (await appWindow()).minimize();
    } catch {
      // noop
    }
  },

  /** 最大化 / 復元をトグルし、状態を再取得する。 */
  async toggleMaximize(): Promise<void> {
    if (!inTauri()) return;
    try {
      const w = await appWindow();
      await w.toggleMaximize();
      maximized = await w.isMaximized();
    } catch {
      // noop
    }
  },

  /** ウィンドウを閉じる。 */
  async close(): Promise<void> {
    if (!inTauri()) return;
    try {
      await (await appWindow()).close();
    } catch {
      // noop
    }
  },
};
