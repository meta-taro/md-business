/**
 * 静的サイト書き出しの共有コントローラ。
 *
 * 単一 HTML 書き出し（htmlExportController）が「今開いている 1 文書」を出すのに対し、
 * こちらは開いているフォルダの `.md` を全部まとめて `dist/` へ出す。開いている文書に
 * 依存しないので、プレビューの描画状況（ready）は見ない。
 *
 * 書き出し先は**渡さない**。Rust 側が開いているフォルダ直下の `dist/` に固定し、
 * こちらから渡せるのはその中での相対パスだけ（export_site）。
 */
import { invoke } from '@tauri-apps/api/core';
import { browser } from '$app/environment';
import { workspace } from '$lib/workspace/workspace.svelte';
import type { SiteSkip } from './staticSite';
import { collectSitePlan } from './collectSite';

/** 結果表示が自分で消えるまで。単一 HTML 書き出しと揃える。 */
const NOTICE_MS = 8000;

/** Rust `export_site` の戻り。 */
interface SiteWriteResult {
  dir: string;
  count: number;
}

/** 直近の書き出し結果。文言は表示側（TopBar）で組む。 */
export type SiteExportResult =
  /** 書き出した。`skipped` はページに出来なかった文書。 */
  | { kind: 'done'; dir: string; count: number; skipped: SiteSkip[] }
  /** 出せる文書が 1 つも無かった。 */
  | { kind: 'none'; skipped: SiteSkip[] }
  /**
   * web モードのフォルダだが、この PC でまだ許していない。
   *
   * 落として書き出さない。落とした中身は見た目が壊れていないので、
   * 開くまで（配ってから）気づけない。
   */
  | { kind: 'consent' }
  | { kind: 'error'; message: string };

class SiteExportController {
  /** 書き込み中。二重に走らせない。 */
  busy = $state<boolean>(false);
  /** 直近の結果。しばらくして自分で消える。 */
  result = $state<SiteExportResult | null>(null);
  #timer: ReturnType<typeof setTimeout> | null = null;

  /** ボタンの活性条件：書き込み中でない・フォルダが開いている。 */
  get canExport(): boolean {
    return !this.busy && workspace.root !== null;
  }

  /** Top bar のボタンから呼ぶ。結果は自分で出す。 */
  async run(): Promise<void> {
    if (!this.canExport) return;
    const root = workspace.root;
    if (root === null) return;
    this.#notify(await this.execute(root));
  }

  /**
   * 書き出しだけを行い、結果を返す（表示はしない）。
   *
   * 出す操作のように、書き出したあとに続きがある側から呼ぶ。途中の結果を出してしまうと、
   * まだ終わっていないのに終わったように見える。
   */
  async execute(root: string): Promise<SiteExportResult> {
    this.busy = true;
    try {
      // 宣言と同意の突き合わせも、ブラウザ表示と同じものを通す。ここを飛ばすと
      // 本文の HTML も CSS も JS も入らないフォルダが、成功として出来上がる。
      const declaration = await invoke<string>('read_project_config', { root });
      const { planWrite, sitePolicyFrom } = await import('./sitePolicy');
      const policy = sitePolicyFrom(declaration);
      const trusted = policy.scripts
        ? (await invoke<{ trusted: boolean }>('project_trust_status', { path: root })).trusted
        : false;
      const step = planWrite(policy, trusted);
      if (step.kind === 'consent') {
        return { kind: 'consent' };
      }

      // 出来上がったフォルダには、見出しを返す待ち受けが付いてこない。下見と同じ
      // 制限をページ自身に持たせる。中身は待ち受けと同じところで組む（別々に書くと、
      // ずれても誰も落ちないまま、確かめたページと配ったページが変わる）。
      const csp = await invoke<string>('exported_site_csp', {
        policy: { scripts: step.rawHtml, scriptOrigins: policy.scriptOrigins },
      });

      // 組み立てはブラウザ表示と同じ手順を通す（collectSite）。
      const plan = await collectSitePlan(root, { rawHtml: step.rawHtml, csp });
      if (plan.pages.length === 0) {
        // 出せる文書が無いか、全部プレビューに失敗した。中身の無いサイトを置いても使い道が無い。
        return { kind: 'none', skipped: plan.skipped };
      }

      // 画像は中身を渡さず「どれをどこへ」だけを渡す。読むのも置くのも Rust 側。
      const written = await invoke<SiteWriteResult>('export_site', {
        root,
        files: plan.files,
        assets: plan.assets,
      });
      return {
        kind: 'done',
        dir: written.dir,
        count: written.count,
        skipped: plan.skipped,
      };
    } catch (e) {
      // Rust の Err(String) は reject 値として届く（Error とは限らない）。
      return { kind: 'error', message: e instanceof Error ? e.message : String(e) };
    } finally {
      this.busy = false;
    }
  }

  #notify(result: SiteExportResult): void {
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

/** アプリ全体で 1 つの共有サイト書き出しコントローラ。 */
export const siteExport = new SiteExportController();
