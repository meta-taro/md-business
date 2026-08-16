/**
 * HTML 書き出しの共有コントローラ。
 *
 * Top bar の [HTML] ボタンと、書き出す中身（開いている文書）は別の場所にある。
 * pdfExport と同じくシングルトンを挟むが、PDF と違って iframe を触らないので、
 * プレビュー側からの登録は要らない。要るのは「今プレビューが出せているか」だけで、
 * それだけを setReady で受け取る。
 *
 * 書き出し先は**渡さない**。Rust 側が元の `.md` の場所から機械的に決める。
 * ここから場所を指定できる作りにすると、書ける範囲が開いているフォルダより広くなる。
 */
import { invoke } from '@tauri-apps/api/core';
import { browser } from '$app/environment';
import { workspace } from '$lib/workspace/workspace.svelte';
import { buildExportHtml } from './htmlExport';

/** 結果表示が自分で消えるまで。読めば用の済む知らせなので閉じる操作を増やさない。 */
const NOTICE_MS = 8000;

/** 直近の書き出し結果。成功なら書き出し先、失敗なら理由。 */
export type HtmlExportResult = { ok: true; path: string } | { ok: false; message: string };

class HtmlExportController {
  /** プレビューが描画済みか（＝書き出す中身がある）。 */
  ready = $state<boolean>(false);
  /** 書き込み中。二重に走らせない。 */
  busy = $state<boolean>(false);
  /** 直近の結果。しばらくして自分で消える。 */
  result = $state<HtmlExportResult | null>(null);
  #timer: ReturnType<typeof setTimeout> | null = null;

  /** プレビューの描画可否に追従して更新する（$effect から呼ぶ）。 */
  setReady(value: boolean): void {
    this.ready = value;
  }

  /** [HTML] ボタンの活性条件：プレビュー描画済み・書き込み中でない・文書が開いている。 */
  get canExport(): boolean {
    return this.ready && !this.busy && workspace.root !== null && workspace.activePath !== null;
  }

  /** Top bar の [HTML] から呼ぶ。書き出し先は Rust が決めるので、ここでは渡さない。 */
  async run(): Promise<void> {
    if (!this.canExport) return;
    const root = workspace.root;
    const relPath = workspace.activePath;
    if (root === null || relPath === null) return;

    const html = buildExportHtml(workspace.source);
    // canExport を満たしていれば通常ここには来ない（プレビューが出ている＝組める）。
    if (html === null) return;

    this.busy = true;
    try {
      const written = await invoke<string>('export_html', { root, relPath, html });
      this.#notify({ ok: true, path: written });
    } catch (e) {
      // Rust の Err(String) は reject 値として届く（Error とは限らない）。
      this.#notify({ ok: false, message: e instanceof Error ? e.message : String(e) });
    } finally {
      this.busy = false;
    }
  }

  #notify(result: HtmlExportResult): void {
    if (this.#timer !== null) clearTimeout(this.#timer);
    this.#timer = null;
    this.result = result;
    if (!browser) return;
    this.#timer = setTimeout(() => {
      this.result = null;
      this.#timer = null;
    }, NOTICE_MS);
  }
}

/** アプリ全体で 1 つの共有 HTML 書き出しコントローラ。 */
export const htmlExport = new HtmlExportController();
