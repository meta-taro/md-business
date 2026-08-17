/**
 * 画像書き出しの共有コントローラ。
 *
 * htmlExportController と同じ形（プレビューの描画可否を受け取り、押されたら
 * 書き出し一式を遅延読み込みして Rust へ渡す）。違うのは、押す前に何を撮るかを
 * 選ばせる分の状態（型・倍率・形式）をここが持つこと。
 *
 * 選んだ内容は開いている間だけ覚える。保存すると、別の文書を開いたときに
 * 前の文書向けの寸法で撮ってしまい、出来上がりを見るまで気づけない。
 *
 * 書き出し先は**渡さない**。Rust 側が元の `.md` の場所から機械的に決める。
 */
import { invoke } from '@tauri-apps/api/core';
import { browser } from '$app/environment';
import { workspace } from '$lib/workspace/workspace.svelte';
import { DEFAULT_ORDER, buildShotSpec, describeOutput, type ImageOrder } from './imageExport';

/** 結果表示が自分で消えるまで。HTML 書き出しと揃える。 */
const NOTICE_MS = 8000;

/** 直近の書き出し結果。成功なら書き出し先、失敗なら理由。 */
export type ImageExportResult = { ok: true; path: string } | { ok: false; message: string };

class ImageExportController {
  /** プレビューが描画済みか（＝撮る中身がある）。 */
  ready = $state<boolean>(false);
  /** 撮影中。二重に走らせない。 */
  busy = $state<boolean>(false);
  /** 直近の結果。しばらくして自分で消える。 */
  result = $state<ImageExportResult | null>(null);
  /** 選んでいる注文（型・倍率・形式）。 */
  order = $state<ImageOrder>({ ...DEFAULT_ORDER });
  /** 選ぶ欄を開いているか。閉じている間は一覧を組まない。 */
  picking = $state<boolean>(false);
  #timer: ReturnType<typeof setTimeout> | null = null;

  /** プレビューの描画可否に追従して更新する（$effect から呼ぶ）。 */
  setReady(value: boolean): void {
    this.ready = value;
  }

  /** 押す前に見せる「実際に出るもの」。 */
  get summary(): string {
    return describeOutput(this.order);
  }

  /** [画像] ボタンの活性条件：プレビュー描画済み・撮影中でない・文書が開いている。 */
  get canExport(): boolean {
    return this.ready && !this.busy && workspace.root !== null && workspace.activePath !== null;
  }

  /** 選ぶ欄の開閉。撮れない状態では開かない（開いても押せる先がない）。 */
  toggle(): void {
    if (!this.picking && !this.canExport) return;
    this.picking = !this.picking;
  }

  /** 選ぶ欄を閉じる（外を押したとき・撮り終えたとき）。 */
  close(): void {
    this.picking = false;
  }

  /** 注文の一部を差し替える。触っていない項目は残す。 */
  choose(patch: Partial<ImageOrder>): void {
    this.order = { ...this.order, ...patch };
  }

  /** 選んだ内容で 1 枚撮る。書き出し先は Rust が決めるので、ここでは渡さない。 */
  async run(): Promise<void> {
    if (!this.canExport) return;
    const root = workspace.root;
    const relPath = workspace.activePath;
    if (root === null || relPath === null) return;

    // 撮る中身はプレビューと同じ描画一式。[画像] を押さない起動では読まれない。
    const { buildExportHtml } = await import('./htmlExport');
    const html = await buildExportHtml(workspace.source);
    // canExport を満たしていれば通常ここには来ない（プレビューが出ている＝組める）。
    if (html === null) return;

    const spec = buildShotSpec(this.order);
    this.busy = true;
    this.picking = false;
    try {
      const written = await invoke<string>('export_image', { root, relPath, html, spec });
      this.#notify({ ok: true, path: written });
    } catch (e) {
      // Rust の Err(String) は reject 値として届く（Error とは限らない）。
      this.#notify({ ok: false, message: e instanceof Error ? e.message : String(e) });
    } finally {
      this.busy = false;
    }
  }

  #notify(result: ImageExportResult): void {
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

/** アプリ全体で 1 つの共有画像書き出しコントローラ。 */
export const imageExport = new ImageExportController();
