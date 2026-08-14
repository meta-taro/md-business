/**
 * 時系列面の共有 rune ストア。
 *
 * 画面から呼ぶ手順は 3 段。ログを選ぶ → 拾い読みして候補を出す → 組み立てる。
 * 段を飛ばさないのは、時刻にする項目が決まらないと組み立てようがないため。
 *
 * 判断はここに書かない。候補の出し方・選択の持ち方・印の付け方は
 * `fieldCandidates.ts` / `timelinePlan.ts` にあり、単体で確かめてある。
 * ここが持つのは Tauri の呼び出しと、いまどの段にいるかだけ。
 */
import { buildTimeline, type BuildTimelineOk } from '@md-business/mcp-server/logs';
import { sampleRecords } from './sampleRecords';
import { createTauriLineSource, scanLogs, type LogFile } from './tauriLineSource';
import {
  chooseJoinKey,
  chooseTimeField,
  createPlan,
  joinMarks,
  toTimelineInput,
  type PlanInput,
  type TimelinePlan,
} from './timelinePlan';

function reason(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return String(error);
}

class TimelineViewStore {
  /** 右面を時系列に切り替えているか。 */
  active = $state<boolean>(false);
  /** ワークスペースにあるログの一覧。 */
  files = $state<LogFile[]>([]);
  /** 一覧が上限で切れたか。 */
  filesTruncated = $state<boolean>(false);
  scanning = $state<boolean>(false);
  /** 一覧・拾い読み・組み立てで出た理由（どれも同じ場所に出す）。 */
  error = $state<string | null>(null);

  /** 選んだログ（一覧の相対パス）。 */
  selected = $state<string[]>([]);
  /** 拾い読みの結果から作った下ごしらえ。 */
  plan = $state<TimelinePlan | null>(null);
  preparing = $state<boolean>(false);

  result = $state<BuildTimelineOk | null>(null);
  building = $state<boolean>(false);

  /** 出来事ごとの結合キーの印。結合キー未選択なら全部 undefined。 */
  marks = $derived(
    this.result === null || this.plan === null ? [] : joinMarks(this.result.events, this.plan),
  );

  async open(root: string): Promise<void> {
    this.active = true;
    await this.scan(root);
  }

  close(): void {
    this.active = false;
  }

  /** 別のフォルダを開いたときなど、持ち越すと嘘になるものを捨てる。 */
  reset(): void {
    this.active = false;
    this.files = [];
    this.filesTruncated = false;
    this.selected = [];
    this.plan = null;
    this.result = null;
    this.error = null;
  }

  async scan(root: string): Promise<void> {
    this.scanning = true;
    this.error = null;
    try {
      const list = await scanLogs(root);
      this.files = list.entries;
      this.filesTruncated = list.truncated;
      // 一覧から消えたファイルの選択は残さない。
      const known = new Set(list.entries.map((entry) => entry.relPath));
      this.selected = this.selected.filter((path) => known.has(path));
    } catch (error) {
      this.error = reason(error);
    } finally {
      this.scanning = false;
    }
  }

  toggle(relPath: string): void {
    this.selected = this.selected.includes(relPath)
      ? this.selected.filter((path) => path !== relPath)
      : [...this.selected, relPath];
    // 選び直したら、前の候補も前の結果も当てにならない。
    this.plan = null;
    this.result = null;
  }

  /** 選んだログを先頭だけ読み、候補を出す。 */
  async prepare(root: string): Promise<void> {
    if (this.selected.length === 0) return;
    this.preparing = true;
    this.error = null;
    this.result = null;
    try {
      const source = createTauriLineSource(root);
      const inputs: PlanInput[] = [];
      for (const path of this.selected) {
        inputs.push({ path, sample: await sampleRecords(source, path) });
      }
      this.plan = createPlan(inputs);
    } catch (error) {
      this.error = reason(error);
    } finally {
      this.preparing = false;
    }
  }

  setTimeField(path: string, field: string): void {
    if (this.plan === null) return;
    this.plan = chooseTimeField(this.plan, path, field);
    // 時刻の読み方が変われば並びも変わる。前の結果を残すと、選び直したのに
    // 同じ並びが出ているように見える。
    this.result = null;
  }

  setJoinKey(index: number | undefined): void {
    if (this.plan === null) return;
    this.plan = chooseJoinKey(this.plan, index);
  }

  async build(root: string): Promise<void> {
    if (this.plan === null) return;
    const input = toTimelineInput(this.plan);
    if (input === undefined) return;

    this.building = true;
    this.error = null;
    try {
      const outcome = await buildTimeline(createTauriLineSource(root), input);
      if (outcome.ok) {
        this.result = outcome;
      } else {
        this.result = null;
        this.error = outcome.error;
      }
    } catch (error) {
      this.result = null;
      this.error = reason(error);
    } finally {
      this.building = false;
    }
  }
}

export const timelineView = new TimelineViewStore();
