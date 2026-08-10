// 編集 1 回にかかった時間の計測（副作用側）。集計・整形は純ロジック perf.ts に委譲し、
// ここは時計を読んで記録を溜めるだけの薄い層に留める。
import { tick } from 'svelte';
import { appendSample, SpanCollector, type PerfSample, type SpanName, type ViewState } from './perf';

/**
 * グリッドの行を数えるための選択子。実際に DOM へ出ている行数を測る。
 * 間引いたぶんを埋める詰め物の行は、中身を持たないので数から外す。
 */
const ROW_SELECTOR = '.tsv-grid tbody tr:not(.pad-row)';

/** 開いている文書の形と画面の状態。計測の外側なので、診断を見るときだけ取りに行く。 */
export interface DocShape {
  rows: number;
  columns: number;
  historyChars: number;
  view: ViewState;
}

const EMPTY_SHAPE: DocShape = {
  rows: 0,
  columns: 0,
  historyChars: 0,
  view: { grid: false, editor: true },
};

let samples = $state<PerfSample[]>([]);

/**
 * 文書の形を取りに行く関数。編集のたびに測ると計測そのものが計測対象へ混ざるので、
 * 値を持ち回らず、診断タブが開かれたときにだけ呼ぶ。
 */
let probe: (() => DocShape) | null = null;

/** 集めかけの編集。溜め方の決まりごとは純ロジック側が持つ。 */
const collector = new SpanCollector();

/**
 * 同期処理を終えた時刻。画面へ反映される途中の目印はここを基準に測る。
 * 反映を待っている間に次の編集が始まると入れ替わるので、待ち手は自分の基準と突き合わせる。
 */
let flushBase: number | null = null;

/** 表を組み直し終えた時刻。基準と組にして使う。 */
let gridDrawnAt: number | null = null;

function now(): number {
  return performance.now();
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
    collector.start();
  },

  /**
   * 区間を測って結果を返す。編集の外で呼ばれた場合は測るだけで捨てる
   * （呼び出し側が計測の有無を気にしなくて済むようにする）。
   */
  measure<T>(name: SpanName, fn: () => T): T {
    const t0 = now();
    try {
      return fn();
    } finally {
      collector.add(name, now() - t0);
    }
  },

  /** 外で測った時間を足す（呼び出し側で時計を読む必要がある場合）。 */
  add(name: SpanName, ms: number): void {
    collector.add(name, ms);
  },

  /**
   * 表を組み直し終えたことを知らせる。画面反映のうち、どこまでが表のぶんかを
   * 分けるための目印（表の外に消えている時間を見つけるのが目的）。
   * 反映は何度か走り直すことがあるので、最後に打たれたものを採る。
   */
  markGrid(): void {
    if (flushBase === null) return;
    gridDrawnAt = now();
  },

  /**
   * 同期処理の終わりを告げ、DOM への反映まで測ってから 1 件として記録する。
   *
   * 描画には差分判定も含まれる（描画中に読まれるため）。締めるのは描画を待ってから
   * にして、その間に測った区間も同じ 1 件へ入れる。両方を出すのは、描画のどれだけを
   * 差分判定が占めているかを読み取れるようにするため。
   */
  finishEdit(): void {
    const pending = collector.endSync();
    if (pending === null) return;
    const syncEndAt = now();
    flushBase = syncEndAt;
    gridDrawnAt = null;
    void tick().then(() => {
      // 待っている間に次の編集が始まっていれば、目印は新しい編集のものになっている。
      if (flushBase === syncEndAt && gridDrawnAt !== null) {
        pending.grid = gridDrawnAt - syncEndAt;
      }
      pending.render = now() - syncEndAt;
      collector.close();
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
    collector.reset();
    flushBase = null;
    gridDrawnAt = null;
  },
};
