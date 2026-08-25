/**
 * 「出す」（公開）の進行を持つ共有コントローラ。
 *
 * 押すと、組み立て（書き出し）→ 下見 → コミット → 送信 の順に進む。
 * **押すのは人。**ここまでの材料は道具側が全部揃えられるが、外へ出す一押しだけは
 * 手元に残す（出したものは取り消せない）。
 *
 * 下見を先に出すのは、何が出るかを見ないまま押させないため。commit するのは
 * 下見に並べた分だけで、下見の後に増えたものは黙って混ぜない。
 */
import { invoke } from '@tauri-apps/api/core';
import { workspace } from '$lib/workspace/workspace.svelte';
import { git } from '$lib/git/git.svelte';
import { planPublish, type PublishPlan, type PublishSurvey } from '$lib/git/publishPlan';
import { siteExport, type SiteExportResult } from './siteExportController.svelte';

/** 送り終わったあとの結果。 */
export interface PublishDone {
  /** 置き先が「続きはここで」と返してきた URL（無ければ null）。 */
  url: string | null;
  /** 出したものが走っているところ（分からない置き先では null）。 */
  runsUrl: string | null;
  /** commit した数。0 なら手元の commit を送っただけ。 */
  committed: number;
}

class PublishController {
  /** 何かを進めている最中。二重に走らせない。 */
  busy = $state<boolean>(false);
  /** 下見。null なら出していない。 */
  plan = $state<PublishPlan | null>(null);
  /** 下見と一緒に見せる、組み立ての結果。 */
  build = $state<SiteExportResult | null>(null);
  /** 送り終わった結果。 */
  done = $state<PublishDone | null>(null);
  /** 途中で落ちた理由（Rust から届いた文言をそのまま）。 */
  error = $state<string | null>(null);
  /** 下見を取った時点のフォルダ。開き直したら下見は捨てる。 */
  #root = $state<string | null>(null);

  /** ボタンの活性条件：進行中でない・フォルダが開いている。 */
  get canPublish(): boolean {
    return !this.busy && workspace.root !== null;
  }

  /**
   * 組み立ててから下見を取る。
   *
   * 先に組み立てるのは、組み立てで出来たものまで含めて「何が出るか」を見せるため。
   * 下見を取ってから組み立てると、下見に無いものが出る。
   */
  async prepare(): Promise<void> {
    if (!this.canPublish) return;
    const root = workspace.root;
    if (root === null) return;

    this.busy = true;
    this.done = null;
    this.error = null;
    try {
      const build = await siteExport.execute(root);
      if (build.kind === 'error') {
        this.error = build.message;
        return;
      }
      const survey = await invoke<PublishSurvey>('publish_survey', { root });
      this.build = build;
      this.plan = planPublish(survey);
      this.#root = root;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    } finally {
      this.busy = false;
    }
  }

  /** 下見を閉じる（何も出さない）。 */
  cancel(): void {
    this.plan = null;
    this.build = null;
    this.#root = null;
  }

  /** 結果の表示を閉じる。 */
  dismiss(): void {
    this.done = null;
    this.error = null;
  }

  /**
   * 下見のとおりに出す。commit してから送る。
   *
   * commit するのは下見に並べた分だけ。全部を掴む書き方にしないのは、
   * 下見を見せてから押すまでの間に増えたものを、見せずに出さないため。
   */
  async publish(message: string): Promise<void> {
    const plan = this.plan;
    const root = this.#root;
    if (this.busy || plan === null || plan.kind !== 'ready' || root === null) return;

    this.busy = true;
    try {
      if (plan.paths.length > 0) {
        await git.commit(root, message, plan.paths);
      }
      const url = await git.push(root);
      this.done = { url, runsUrl: plan.runsUrl, committed: plan.paths.length };
      this.plan = null;
      this.build = null;
      this.#root = null;
    } catch (e) {
      // 送信は落ちることがある（送り先の設定・資格情報・置き先に断られた）。
      // 下見は閉じない。理由を直したらそのまま押し直せる。
      this.error = e instanceof Error ? e.message : String(e);
    } finally {
      this.busy = false;
    }
  }
}

/** アプリ全体で 1 つの共有公開コントローラ。 */
export const publish = new PublishController();
