/**
 * 時系列を組む前の下ごしらえ。
 * -----------------------------------------------------------------------------
 * どのファイルのどの項目が時刻かは、開いてみるまで分からない。候補は出せるが、
 * 候補は事実ではないので、ここは **決めない**。持つのは次の 3 つだけ。
 *
 * 1. ファイルごとの候補と、いま選ばれている項目
 * 2. その項目が **人が選んだもの**か、候補の先頭を置いただけかの区別（`confirmed`）
 * 3. 組み立てに渡せる状態か（`ready`）
 *
 * 画面を挟まずに確かめられるよう、ここは Svelte も Tauri も呼ばない。
 */
import type {
  BuildTimelineInput,
  RecordFormat,
  TimelineEvent,
  TimelineSource,
} from '@md-business/mcp-server/logs';
import { pick, toText } from '@md-business/mcp-server/logs';
import {
  joinKeyCandidates,
  timeFieldCandidates,
  type JoinKeyCandidate,
  type TimeFieldCandidate,
} from './fieldCandidates';
import type { SampleError, SampleOk } from './sampleRecords';

export interface PlanInput {
  path: string;
  sample: SampleOk | SampleError;
}

export interface SourcePlan {
  path: string;
  /** 拾い読みで判った形式。読めなかったファイルでは持たない。 */
  format?: RecordFormat;
  candidates: TimeFieldCandidate[];
  /** 時刻にする項目。決まっていなければ空。 */
  timeField: string;
  /** 人が選んだか。false は候補の先頭を置いただけ（＝推定）。 */
  confirmed: boolean;
  /** レコードとして読めなかった行数。 */
  skipped: number;
  /** 拾い読みに失敗した理由。持っていれば組み立ての対象外。 */
  error?: string;
}

export interface TimelinePlan {
  sources: SourcePlan[];
  joinKeys: JoinKeyCandidate[];
  /** 選ばれている結合キー（`joinKeys` の添字）。選んでいなければ持たない。 */
  joinKey?: number;
  /** 組み立てに渡せるか。読めるファイルが 1 つ以上あり、その全部で時刻の項目が決まっている。 */
  ready: boolean;
}

function readable(source: SourcePlan): boolean {
  return source.error === undefined;
}

function isReady(sources: readonly SourcePlan[]): boolean {
  const usable = sources.filter(readable);
  return usable.length > 0 && usable.every((s) => s.timeField !== '');
}

/**
 * 拾い読みの結果から下ごしらえを作る。
 *
 * 候補の先頭を `timeField` に置くが、`confirmed` は立てない。ここを立てると
 * 表示側で推定と選択の区別が付かなくなり、候補が事実として通ってしまう。
 */
export function createPlan(inputs: readonly PlanInput[]): TimelinePlan {
  const sources: SourcePlan[] = inputs.map(({ path, sample }) => {
    if (!sample.ok) {
      return { path, candidates: [], timeField: '', confirmed: false, skipped: 0, error: sample.error };
    }
    const candidates = timeFieldCandidates(sample.records);
    return {
      path,
      format: sample.format,
      candidates,
      timeField: candidates[0]?.field ?? '',
      confirmed: false,
      skipped: sample.skipped,
    };
  });

  const joinKeys = joinKeyCandidates(
    inputs
      .filter((input): input is PlanInput & { sample: SampleOk } => input.sample.ok)
      .map((input) => ({ path: input.path, records: input.sample.records })),
  );

  return { sources, joinKeys, ready: isReady(sources) };
}

/** 時刻にする項目を決める。候補に無い項目でも受け付ける（人は項目名を打てる）。 */
export function chooseTimeField(plan: TimelinePlan, path: string, field: string): TimelinePlan {
  const sources = plan.sources.map((source) =>
    source.path === path ? { ...source, timeField: field, confirmed: field !== '' } : source,
  );
  return { ...plan, sources, ready: isReady(sources) };
}

/** 結合キーを選ぶ。`undefined` で選択を外す。 */
export function chooseJoinKey(plan: TimelinePlan, index: number | undefined): TimelinePlan {
  if (index === undefined) {
    const { joinKey: _removed, ...rest } = plan;
    return rest;
  }
  return { ...plan, joinKey: index };
}

/**
 * 組み立ての入力へ直す。渡せない状態なら `undefined`。
 *
 * 形式は拾い読みで判ったものをそのまま渡す。拡張子から読み直させると、
 * 拡張子と中身が食い違うファイル（`.log` の中身が JSONL 等）で結果が変わる。
 */
export function toTimelineInput(plan: TimelinePlan): BuildTimelineInput | undefined {
  if (!plan.ready) return undefined;
  const sources: TimelineSource[] = plan.sources.filter(readable).map((source) => ({
    path: source.path,
    format: source.format,
    timeField: source.timeField,
  }));
  return { sources };
}

/**
 * 結合キーの値でまとまる行に印を付ける。
 *
 * 返すのは出来事と同じ並びの配列で、印は 0 始まりの通し番号。**2 つ以上のファイルに
 * 現れた値にだけ**付ける——1 ファイルの中で繰り返しているだけの値に印を付けると、
 * 突き合わせられたように見えてしまう。
 */
export function joinMarks(
  events: readonly TimelineEvent[],
  plan: TimelinePlan,
): (number | undefined)[] {
  const candidate = plan.joinKey === undefined ? undefined : plan.joinKeys[plan.joinKey];
  if (candidate === undefined) return events.map(() => undefined);

  const fieldByPath = new Map(candidate.fields.map((f) => [f.path, f.field]));
  const valueOf = (event: TimelineEvent): string | undefined => {
    const field = fieldByPath.get(event.path);
    if (field === undefined) return undefined;
    const text = toText(pick(event.record, field));
    return text === undefined || text === '' ? undefined : text;
  };

  const paths = new Map<string, Set<string>>();
  for (const event of events) {
    const value = valueOf(event);
    if (value === undefined) continue;
    const seen = paths.get(value) ?? new Set<string>();
    paths.set(value, seen);
    seen.add(event.path);
  }

  const marks = new Map<string, number>();
  return events.map((event) => {
    const value = valueOf(event);
    if (value === undefined || (paths.get(value)?.size ?? 0) < 2) return undefined;
    const mark = marks.get(value) ?? marks.size;
    marks.set(value, mark);
    return mark;
  });
}
