/**
 * 差分ビューの共有 rune ストア。変更ファイルをクリックするとエディターで開き、
 * その diff をプレビュー面に表示する導線を担う。
 *
 * ソース管理パネル（下部ドロワー）でファイル行をクリックすると、+page のプレビュー面を
 * この差分表示へ切り替える。両者は別コンポーネントで状態を共有できないため本シングルトンを
 * 置く。Rust `git_diff` コマンドの invoke はここに閉じ、生 diff テキストの分類・描画は
 * diffParse.ts（純関数・単体テスト済み）と DiffView.svelte に委ねる。
 *
 * 通常のファイルオープン（FileTree）や別フォルダを開いた時は close()/reset() で解除し、
 * プレビュー面を元の描画へ戻す。
 */

import { invoke } from '@tauri-apps/api/core';
import type { GitFileState } from './gitStatus';

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  return '差分の取得に失敗しました';
}

class DiffViewStore {
  /** プレビュー面を差分表示に切り替えているか。false なら通常プレビュー。 */
  active = $state<boolean>(false);
  /** 表示中ファイルの repo root 基準パス（ヘッダ表示用）。未表示は null。 */
  relPath = $state<string | null>(null);
  /** 表示中ファイルの git 状態（ヘッダのバッジ色）。 */
  state = $state<GitFileState | null>(null);
  /** Rust git_diff が返した生 unified diff テキスト。 */
  raw = $state<string>('');
  /** 取得中フラグ（差分面のローディング表示用）。 */
  loading = $state<boolean>(false);
  /** 取得エラー（非リポジトリ・読み取り失敗など）。 */
  error = $state<string | null>(null);

  /**
   * `repoRelPath`（git status のパス＝repo root 基準）の差分を取得して差分面を開く。
   * 取得中でも即 active にして「開いた」感触を出し、結果が来たら raw/error を差し替える。
   * git_diff は空文字列（＝ディスク未変更）も正常に返すので、その場合は「差分なし」表示にする。
   */
  async show(root: string, repoRelPath: string, state: GitFileState | null): Promise<void> {
    this.active = true;
    this.relPath = repoRelPath;
    this.state = state;
    this.loading = true;
    this.error = null;
    this.raw = '';
    try {
      this.raw = await invoke<string>('git_diff', { root, relPath: repoRelPath });
    } catch (e) {
      this.error = errorMessage(e);
    } finally {
      this.loading = false;
    }
  }

  /** 差分面を閉じて通常プレビューへ戻す（表示内容も破棄）。 */
  close(): void {
    this.active = false;
    this.relPath = null;
    this.state = null;
    this.raw = '';
    this.error = null;
    this.loading = false;
  }

  /** フォルダを閉じた / 切り替えた時に状態を全消去する（close と同義・意図明示の別名）。 */
  reset(): void {
    this.close();
  }
}

/** アプリ全体で 1 つの共有差分ビューストア。 */
export const diffView = new DiffViewStore();
