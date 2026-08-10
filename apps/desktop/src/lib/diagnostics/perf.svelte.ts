// 編集 1 回にかかった時間の計測（副作用側）。集計・整形は純ロジック perf.ts に委譲し、
// ここは時計を読んで記録を溜めるだけの薄い層に留める。
import { tick } from 'svelte';
import { appendSample, type PerfSample, type SpanName } from './perf';

/** グリッドの行を数えるための選択子。実際に DOM へ出ている行数を測る。 */
const ROW_SELECTOR = '.tsv-grid tbody tr';

/** 開いている文書の形。計測の外側なので、診断を見るときだけ取りに行く。 */
export interface DocShape {
  rows: number;
  columns: number;
  historyChars: number;
}

const EMPTY_SHAPE: DocShape = { rows: 0, columns: 0, historyChars: 0 };

let samples = $state<PerfSample[]>([]);

/**
 * 文書の形を取りに行く関数。編集のたびに測ると計測そのものが計測対象へ混ざるので、
 * 値を持ち回らず、診断タブが開かれたときにだけ呼ぶ。
 */
let probe: (() => DocShape) | null = null;

/** いま集めている途中の編集。編集の外では null。 */
let current: Partial<Record<SpanName, number>> | null = null;
/** 同期処理を終えた時刻。ここから DOM へ反映されるまでを描画として測る。 */
let syncEndAt = 0;

function now(): number {
  return performance.now();
}

/**
 * 測った時間を足す。同じ区間が 1 回の編集で複数回走ることがあるため（差分判定など）、
 * 上書きではなく加算する。
 */
function addSpan(name: SpanName, ms: number): void {
  if (current === null) return;
  current[name] = (current[name] ?? 0) + ms;
}

export const perf = {
  /** 記録（新しい順）。 */
  get samples(): readonly PerfSample[] {
    return samples;
  },

  /** いま DOM に出ているグリッドの行数。行を間引いていればここが総行数より小さくなる。 */
  get domRows(): number {
    try {
      return document.querySelectorAll(ROW_SELECTOR).length;
    } catch {
      return 0;
    }
  },

  /** 文書の形を取りに行く関数を差す。開いている文書を知っている側が一度だけ呼ぶ。 */
  setProbe(fn: () => DocShape): void {
    probe = fn;
  },

  /** 開いている文書の形。差されていなければ 0。 */
  shape(): DocShape {
    if (probe === null) return EMPTY_SHAPE;
    try {
      return probe();
    } catch {
      // グリッドを開いていない・読み込み中は取れない。0 として扱う。
      return EMPTY_SHAPE;
    }
  },

  /** 編集 1 回の計測を始める。前の編集が終わっていなければ捨てて取り直す。 */
  startEdit(): void {
    current = {};
  },

  /**
   * 区間を測って結果を返す。編集の外で呼ばれた場合は測るだけで捨てる
   * （呼び出し側が計測の有無を気にしなくて済むようにする）。
   */
  measure<T>(name: SpanName, fn: () => T): T {
    if (current === null) return fn();
    const t0 = now();
    try {
      return fn();
    } finally {
      addSpan(name, now() - t0);
    }
  },

  /** 外で測った時間を足す（呼び出し側で時計を読む必要がある場合）。 */
  add(name: SpanName, ms: number): void {
    addSpan(name, ms);
  },

  /**
   * 同期処理の終わりを告げ、DOM への反映まで測ってから 1 件として記録する。
   *
   * 描画には差分判定も含まれる（描画中に読まれるため）。両方を出すのは、描画の
   * どれだけを差分判定が占めているかを読み取れるようにするため。
   */
  finishEdit(): void {
    if (current === null) return;
    syncEndAt = now();
    const pending = current;
    current = null;
    void tick().then(() => {
      pending.render = now() - syncEndAt;
      samples = appendSample(samples, { at: Date.now(), spans: pending });
    });
  },

  /** 保存の往復を記録する。編集とは別の頻度で走るので 1 件として独立させる。 */
  recordSave(ms: number): void {
    samples = appendSample(samples, { at: Date.now(), spans: { save: ms } });
  },

  /** 記録を捨てる。 */
  clear(): void {
    samples = [];
    current = null;
  },
};
