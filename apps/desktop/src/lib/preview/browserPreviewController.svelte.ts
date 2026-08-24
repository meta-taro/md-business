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

/** この PC でまだ許していないフォルダが、script を動かすことを求めている。 */
export interface PendingConsent {
  /** 尋ねている対象のフォルダ。 */
  root: string;
  /** 宣言されている、プロジェクト以外からの取り寄せ先。 */
  origins: string[];
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
  /**
   * 同意を尋ねている最中。人が押すまで待つので、自分では消えない。
   *
   * ここに入っている間は待ち受けを立てていない。押されなければ何も動かないままで終わる。
   */
  consent = $state<PendingConsent | null>(null);
  /** どのフォルダを出しているか。フォルダが替わったら畳むために持つ。 */
  #servingRoot: string | null = null;
  /**
   * 出しているフォルダで、本文の HTML をそのまま載せているか。
   *
   * 組み直しのたびに宣言と同意を引き直さない。立てたときの答えをそのまま使う。
   * 引き直すと、出している最中に宣言だけを書き換えて実行の範囲を広げられる。
   */
  #servingRawHtml = false;
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
      // 宣言はプロジェクトの中にあるので、求めているものでしかない。動かしてよいかは
      // Rust 側がこの PC の同意と突き合わせて決める。ここでは汲み取らずに渡すだけ。
      const declaration = await invoke<string>('read_project_config', { root });
      // 宣言を読む道具はここで初めて要る。上で読み込むと、YAML の読み手が
      // 起動時の JS に混ざって、下見を一度も押さない人まで待たされる。
      const { planStart, sitePolicyFrom } = await import('./sitePolicy');
      const policy = sitePolicyFrom(declaration);
      // 同意を答えるのはアプリの側。ここで持っている値を根拠にしない。
      const trusted = policy.scripts
        ? (await invoke<{ trusted: boolean }>('project_trust_status', { path: root })).trusted
        : false;
      const step = planStart(policy, trusted);
      if (step.kind === 'consent') {
        // 黙って script 抜きで出さない。出てしまうと、書いた本人には
        // 「宣言が読まれていない」と見えて、宣言のほうを書き換えて回ることになる。
        // 組み立てる前に返す。許していないフォルダの中身は、まだ形にしない。
        this.consent = { root, origins: policy.scriptOrigins };
        return;
      }
      // 本文に直接書かれた HTML を載せるのは、宣言と同意が揃ったときだけ。
      // 揃っていなければ今までどおり落とすので、業務文書の出方は変わらない。
      const rawHtml = step.policy.scripts && trusted;
      const plan = await collectSitePlan(root, { rawHtml });
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
        policy: step.policy,
      });
      this.serving = info;
      this.#servingRoot = root;
      this.#servingRawHtml = rawHtml;
      this.#clearNotice();
      await openUrl(info.url);
    } catch (e) {
      // Rust の Err(String) は reject 値として届く（Error とは限らない）。
      this.#notify({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
    } finally {
      this.busy = false;
    }
  }

  /**
   * 尋ねていたフォルダを許して、そのまま出す。**人が画面で押したときだけ呼ぶ。**
   *
   * 許可はこの PC に残り、フォルダの中身が変わっても外れない。プロジェクト側からは書けない。
   */
  async allow(): Promise<void> {
    const pending = this.consent;
    if (pending === null) return;
    this.consent = null;
    try {
      await invoke('grant_project_trust', { path: pending.root });
    } catch (e) {
      this.#notify({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
      return;
    }
    await this.start(pending.root);
  }

  /** 尋ねるのをやめる。許可は残らないので、次に押せばまた尋ねる。 */
  dismissConsent(): void {
    this.consent = null;
  }

  /** 待ち受けを畳む。ブラウザ側は次の問い合わせが返らなくなり、そこで止まる。 */
  async stop(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      await invoke('stop_preview_server');
      this.serving = null;
      this.#servingRoot = null;
      this.#servingRawHtml = false;
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
        const plan = await collectSitePlan(root, { rawHtml: this.#servingRawHtml });
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
