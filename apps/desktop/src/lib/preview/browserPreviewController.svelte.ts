/**
 * ブラウザ表示の共有コントローラ。
 *
 * サイト書き出し（siteExportController）が `dist/` へ**置く**のに対し、こちらは同じ中身を
 * 手元の待ち受けから**出す**。組み立ては collectSitePlan で共有していて、画面・書き出し・
 * ブラウザで別物を作らない。
 *
 * 待ち受けているのは 0 個か 1 個（Rust 側が押し直しで前を畳む）。URL に入る合鍵と
 * 割り当てポートは立てるたびに変わるので、こちらでは覚えず、返ってきたものを持つ。
 */
import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import { browser } from '$app/environment';
import { collectSitePlan } from './collectSite';
import { affectsSite, shouldStop } from './browserPreview';

/** 知らせが自分で消えるまで。書き出しと揃える。 */
const NOTICE_MS = 8000;

/** Rust `start_preview_server` / `preview_server_status` の戻り。 */
export interface PreviewServerInfo {
  url: string;
  port: number;
}

/** 出せなかったときの知らせ。出せたときは URL を出しっぱなしにするので、ここには入らない。 */
export type BrowserPreviewNotice =
  /** ページに出来る文書が 1 つも無かった。 */
  | { kind: 'none' }
  | { kind: 'error'; message: string };

class BrowserPreviewController {
  /** 立ち上げ／畳み中。二重に走らせない。 */
  busy = $state<boolean>(false);
  /** 待ち受け中の URL。畳むまで消さない（利用者が読む唯一の手掛かり）。 */
  serving = $state<PreviewServerInfo | null>(null);
  /** 直近の知らせ。しばらくして自分で消える。 */
  notice = $state<BrowserPreviewNotice | null>(null);
  /** どのフォルダを出しているか。フォルダが替わったら畳むために持つ。 */
  #servingRoot: string | null = null;
  /** 組み直し中。終わるまでに来た変化は #queued にまとめる。 */
  #rebuilding = false;
  /** 組み直し中に更に変化が来た。終わったらもう一度だけ組み直す。 */
  #queued = false;
  #timer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Top bar のボタンから呼ぶ。押すたびに立て直し、既定ブラウザで開く。
   *
   * 開いているフォルダは呼ぶ側から受け取る。こちらから読みに行くと、保存のたびに
   * ここを呼ぶワークスペース側との間で参照が輪になる。
   */
  async start(root: string): Promise<void> {
    if (this.busy) return;

    this.busy = true;
    try {
      const plan = await collectSitePlan(root);
      if (plan.pages.length === 0) {
        // 出すものが無い。空の待ち受けを立てても、開いた先に何も無い。
        this.#notify({ kind: 'none' });
        return;
      }
      // 画像は覚えさせず、開いているフォルダのどれを指すかだけ渡す（Rust 側が要求のたびに読む）。
      const info = await invoke<PreviewServerInfo>('start_preview_server', {
        root,
        files: plan.files,
        assets: plan.assets,
      });
      this.serving = info;
      this.#servingRoot = root;
      this.#clearNotice();
      await openUrl(info.url);
    } catch (e) {
      // Rust の Err(String) は reject 値として届く（Error とは限らない）。
      this.#notify({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
    } finally {
      this.busy = false;
    }
  }

  /** 待ち受けを畳む。ブラウザ側は次の問い合わせが返らなくなり、そこで止まる。 */
  async stop(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      await invoke('stop_preview_server');
      this.serving = null;
      this.#servingRoot = null;
      this.#clearNotice();
    } catch (e) {
      this.#notify({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
    } finally {
      this.busy = false;
    }
  }

  /**
   * ファイルが変わったときに呼ぶ。出していない間は何もしない。
   * ページにならないファイルの変化では組み直さない（affectsSite）。
   */
  onFileChanged(relPath: string): void {
    if (this.serving === null) return;
    if (!affectsSite(relPath)) return;
    void this.#rebuild();
  }

  /**
   * 開いているフォルダが替わったときに呼ぶ。
   * 畳まないと、別のフォルダを開いた後も前のフォルダの中身が同じ URL で出続ける。
   */
  syncRoot(root: string | null): void {
    if (this.#servingRoot === null) return;
    if (!shouldStop(this.#servingRoot, root)) return;
    void this.stop();
  }

  /**
   * 中身だけ入れ替える。立て直さないので URL は変わらず、開いたままのブラウザで見続けられる。
   * 組み直しの最中に更に変わったら、終わってからもう一度だけ組み直す（変化のたびに
   * 走らせると、保存が続く間ずっと組み直しが重なる）。
   */
  async #rebuild(): Promise<void> {
    if (this.#rebuilding) {
      this.#queued = true;
      return;
    }
    this.#rebuilding = true;
    try {
      do {
        this.#queued = false;
        const root = this.#servingRoot;
        if (root === null) return;
        const plan = await collectSitePlan(root);
        // 組んでいる間に畳まれていたら、Rust 側は何もしない（立っていない間の
        // 作り直しは無視される）。ここで止める必要はない。
        if (plan.pages.length === 0) continue;
        await invoke('update_preview_server', { root, files: plan.files, assets: plan.assets });
      } while (this.#queued);
    } catch (e) {
      this.#notify({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
    } finally {
      this.#rebuilding = false;
    }
  }

  #clearNotice(): void {
    if (this.#timer !== null) clearTimeout(this.#timer);
    this.#timer = null;
    this.notice = null;
  }

  #notify(notice: BrowserPreviewNotice): void {
    this.#clearNotice();
    this.notice = notice;
    if (!browser) return;
    this.#timer = setTimeout(() => {
      this.notice = null;
      this.#timer = null;
    }, NOTICE_MS);
  }
}

/** アプリ全体で 1 つの共有ブラウザ表示コントローラ。 */
export const browserPreview = new BrowserPreviewController();
