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
import { browser } from '$app/environment';
import { collectSitePlan } from './collectSite';
import { affectsSite, shouldAutoLive, shouldStop, type SiteWatchInput } from './browserPreview';
import type { LiveTrigger } from './browserPreview';

/** 知らせが自分で消えるまで。書き出しと揃える。 */
const NOTICE_MS = 8000;

/** 宣言の置き場所。書き換わったら読み直す。 */
const PROJECT_CONFIG_FILENAME = 'md-business.yml';

/**
 * どのブラウザで開くか。**名前だけを渡す。**
 *
 * 起動するものの在り処は Rust 側の表から引く。ここから渡すと、ページを開く口が
 * 任意のプログラムを起動する口になる。
 */
export type BrowserChoice = 'default' | 'chrome' | 'edge';

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
  /** この PC の許可を戻した。次に出すときは script 抜きの組み立てに戻る。 */
  | { kind: 'revoked' }
  /** 宣言を置いた。置いただけでは動かないので、次に何をするかまで伝える。 */
  | { kind: 'declared' }
  /** 宣言を取り下げた。この PC の許可は残る。 */
  | { kind: 'withdrawn' }
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
  /**
   * この PC に入っていると分かったブラウザ。入っていないものはボタンにしない。
   *
   * 無いものを並べると、押しても何も起きないボタンになる（起動を頼んだ先が無いことは、
   * 頼んだ側からは分からない）。
   */
  installed = $state<BrowserChoice[]>([]);
  /** 同意を尋ねている間、押されたのがどのボタンだったか。許した後に同じ先で開く。 */
  #pendingBrowser: BrowserChoice = 'default';
  /** 同意を尋ねている間、ブラウザを開くつもりだったか。面に映すだけのこともある。 */
  #pendingOpen = true;
  /**
   * 開いているフォルダが web モードを宣言しているか。
   *
   * **ボタンを出すかどうかにしか使わない。**動かしてよいかは、立てるときに宣言と
   * この PC の同意を突き合わせて決める（宣言はプロジェクト側から書けるので、
   * これを根拠にすると、置いただけのファイルで実行の範囲が広がる）。
   */
  declaredWeb = $state<boolean>(false);
  /**
   * その宣言をアプリから書き換えられるか。
   *
   * 手やエージェントが書いた宣言があるときは false。メニューを押せなくして、
   * 中身を黙って崩さないことを先に見せる。
   */
  canDeclareWeb = $state<boolean>(false);
  /**
   * 開いているフォルダを、この PC で許してあるか。
   *
   * **戻す口を出すかどうかにしか使わない。**declaredWeb と同じで、動かしてよいかは
   * 立てるときに引き直す。
   */
  trusted = $state<boolean>(false);
  /** どのフォルダを出しているか。フォルダが替わったら畳むために持つ。 */
  #servingRoot: string | null = null;
  /** いま開いているフォルダ。宣言を読み直すために持つ（出していない間も要る）。 */
  #root: string | null = null;
  /**
   * 出しているフォルダを web モードとして出しているか（本文の HTML をそのまま載せているか）。
   *
   * 組み直しのたびに宣言と同意を引き直さない。立てたときの答えをそのまま使う。
   * 引き直すと、出している最中に宣言だけを書き換えて実行の範囲を広げられる。
   *
   * 読めるようにしてあるのは、アプリのプレビュー面を待ち受けへ向けるかの判断に要るため。
   * 書き換える口は無い（立てるときと畳むときにだけ変わる）。
   */
  servingWeb = $state<boolean>(false);
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
  async start(root: string, choice: BrowserChoice = 'default', open = true): Promise<void> {
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
      // 戻す口を出すかどうかは、いま引いた答えに合わせる（許した直後から押せる）。
      this.trusted = trusted;
      const step = planStart(policy, trusted);
      if (step.kind === 'consent') {
        // 黙って script 抜きで出さない。出てしまうと、書いた本人には
        // 「宣言が読まれていない」と見えて、宣言のほうを書き換えて回ることになる。
        // 組み立てる前に返す。許していないフォルダの中身は、まだ形にしない。
        this.consent = { root, origins: policy.scriptOrigins };
        this.#pendingBrowser = choice;
        this.#pendingOpen = open;
        return;
      }
      // 本文に直接書かれた HTML を載せるのは、宣言と同意が揃ったときだけ。
      // 揃っていなければ今までどおり落とすので、業務文書の出方は変わらない。
      const rawHtml = step.policy.scripts && trusted;
      const plan = await collectSitePlan(root, { rawHtml });
      if (plan.pages.length === 0 && plan.assets.length === 0) {
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
      this.servingWeb = rawHtml;
      this.#clearNotice();
      if (!open) return;
      // URL は渡さない。出しているものは Rust 側が持っているので、そちらのものを開かせる。
      await invoke('open_preview_in_browser', { browser: choice });
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
      this.trusted = true;
    } catch (e) {
      this.#notify({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
      return;
    }
    await this.start(pending.root, this.#pendingBrowser, this.#pendingOpen);
  }

  /**
   * 選んだブラウザで開く。出していなければ、先に立ててから開く。
   *
   * 出している最中は立て直さない。立て直すと URL が変わり、別に開いてある窓が
   * 繋がらなくなる（同じページを 2 つのブラウザで並べて見られなくなる）。
   */
  async openIn(root: string, choice: BrowserChoice): Promise<void> {
    if (this.serving === null) {
      await this.start(root, choice);
      return;
    }
    try {
      await invoke('open_preview_in_browser', { browser: choice });
    } catch (e) {
      this.#notify({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  }

  /**
   * ブラウザを開かずに待ち受けだけ立てる。アプリの面に映すために使う。
   *
   * 立てるだけで、止める口は画面に出さない。同意済みのフォルダを開けば立つのが既定なので、
   * 止めても次に開けば立つ。押して止まるのは、この面が script 抜きの組み立てへ戻ることだけで、
   * それを見たい場面が無い（宣言を書き換える話であって、押して切り替える話ではない）。
   *
   * 残してあるのは、まだ同意が無いフォルダで尋ねる入り口と、立て損ねたときの立て直しのため。
   */
  async goLive(root: string): Promise<void> {
    if (this.serving !== null) return;
    await this.start(root, 'default', false);
  }

  /** この PC に何が入っているかを調べる。画面ができてから 1 回だけ呼ぶ。 */
  async detectBrowsers(): Promise<void> {
    try {
      this.installed = await invoke<BrowserChoice[]>('installed_browsers');
    } catch {
      // 調べられなかったときはボタンを出さない。既定のブラウザで開く道は残る。
      this.installed = [];
    }
  }

  /**
   * この PC の許可を戻す。**人が画面で押したときだけ呼ぶ。**
   *
   * 出している最中なら畳む。許可を戻したのに、その許可で立てたものが出続けると、
   * 押した人には戻せたのかどうかが分からない。
   */
  async revoke(root: string): Promise<void> {
    try {
      await invoke('revoke_project_trust', { path: root });
    } catch (e) {
      this.#notify({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
      return;
    }
    this.trusted = false;
    // 畳むのは stop() を通さずに頼む。立ち上げの最中は stop() が何もしないので、
    // 戻したはずの許可で立てたものが出たままになる。
    if (this.#servingRoot === root) {
      try {
        await invoke('stop_preview_server');
      } catch {
        // 畳めなくても許可は戻っている。次に立てるときは script 抜きの組み立てになる。
      }
      this.serving = null;
      this.#servingRoot = null;
      this.servingWeb = false;
    }
    this.#notify({ kind: 'revoked' });
  }

  /**
   * フォルダの宣言を置く／取り下げる。**人が画面で押したときだけ呼ぶ。**
   *
   * これは許可ではない。置いても動くのは、この PC で 1 回許してから。
   * 置いた瞬間に待ち受けが立つことは無い（読み直しは 'declared' として扱う）。
   */
  async setWebMode(root: string, on: boolean): Promise<void> {
    try {
      await invoke('set_web_mode', { root, on });
    } catch (e) {
      this.#notify({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
      return;
    }
    await this.#checkDeclaration(root, 'declared');
    this.#notify({ kind: on ? 'declared' : 'withdrawn' });
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
      this.servingWeb = false;
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
  onFileChanged(change: SiteWatchInput): void {
    // 宣言そのものが書き換わったら読み直す。出している最中の中身は変えない
    // （立てたときの答えのまま出し続ける）が、ボタンの出方は今の宣言に合わせる。
    if (change.relPath === PROJECT_CONFIG_FILENAME)
      void this.#checkDeclaration(this.#root, 'declared');
    if (this.serving === null) return;
    if (!affectsSite(change, this.servingWeb)) return;
    void this.#rebuild();
  }

  /**
   * 開いているフォルダが替わったときに呼ぶ。
   * 畳まないと、別のフォルダを開いた後も前のフォルダの中身が同じ URL で出続ける。
   */
  syncRoot(root: string | null): void {
    // 取り直しと開き直しを分ける。同じフォルダを走査し直しただけで立て直すと、
    // 押して畳んだ人の手が、走査のたびに元へ戻る。
    const trigger: LiveTrigger = this.#root === root ? 'rescanned' : 'opened';
    this.#root = root;
    void this.#checkDeclaration(root, trigger);
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
        const plan = await collectSitePlan(root, { rawHtml: this.servingWeb });
        // 組んでいる間に畳まれていたら、Rust 側は何もしない（立っていない間の
        // 作り直しは無視される）。ここで止める必要はない。
        if (plan.pages.length === 0 && plan.assets.length === 0) continue;
        await invoke('update_preview_server', { root, files: plan.files, assets: plan.assets });
      } while (this.#queued);
    } catch (e) {
      this.#notify({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
    } finally {
      this.#rebuilding = false;
    }
  }

  /** 宣言を読み直す。読めなければ「宣言なし」と同じ扱いにする。 */
  async #checkDeclaration(root: string | null, trigger: LiveTrigger): Promise<void> {
    if (root === null) {
      this.declaredWeb = false;
      this.canDeclareWeb = false;
      this.trusted = false;
      return;
    }
    try {
      const declaration = await invoke<string>('read_project_config', { root });
      const { sitePolicyFrom, webModeToggle } = await import('./sitePolicy');
      this.declaredWeb = sitePolicyFrom(declaration).scripts;
      this.canDeclareWeb = webModeToggle(declaration) !== 'locked';
    } catch {
      this.declaredWeb = false;
      this.canDeclareWeb = false;
      this.trusted = false;
      return;
    }
    await this.#autoLive(root, trigger);
  }

  /**
   * 押さずにライブを立てる。
   *
   * 同意済みのフォルダを開いたときだけ。同意が無ければ何もしない（尋ねる窓も出さない）。
   * 立てるだけで、ブラウザは開かない。
   */
  async #autoLive(root: string, trigger: LiveTrigger): Promise<void> {
    try {
      // 同意を答えるのはアプリの側。宣言している間だけ訊きに行く。
      const trusted = this.declaredWeb
        ? (await invoke<{ trusted: boolean }>('project_trust_status', { path: root })).trusted
        : false;
      this.trusted = trusted;
      if (
        !shouldAutoLive({
          trigger,
          declaredWeb: this.declaredWeb,
          trusted,
          serving: this.serving !== null,
        })
      ) {
        return;
      }
      await this.start(root, 'default', false);
    } catch {
      // 調べられなければ立てない。ボタンは出ているので、押せば今までどおり立つ。
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
