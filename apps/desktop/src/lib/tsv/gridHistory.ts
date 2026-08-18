/**
 * グリッド編集専用の undo/redo 履歴（DOM 非依存の純ロジック）。
 * 正本は TSV ソース文字列。グリッドで確定した各スナップショットを present に積み、
 * past へ戻る（undo）・future へ進む（redo）だけを扱う。エディタ（CodeMirror）は
 * 独自 undo を持つため、この履歴はグリッドがアクティブな編集面のときだけ使う。
 */

/** past（過去）・present（現在）・future（undo で退避した先）を持つ履歴。 */
export interface GridHistory {
  readonly past: readonly string[];
  readonly present: string;
  readonly future: readonly string[];
  /**
   * 現在値を作った編集の識別子（例: セルの座標）。次の push が同じ識別子なら、
   * 同じ 1 手の続きとみなして present を差し替える。undo / redo で確定した値へ
   * 移った時点で消える（戻ってきた値は確定済みの手なので、続きを結合できない）。
   */
  readonly key?: string;
}

/** [`pushHistory`] の指定。 */
export interface PushOptions {
  /** past の上限。省略時は既定値。 */
  readonly cap?: number;
  /**
   * この編集の識別子。同じ識別子が続く間は 1 手にまとめる。
   * 1 文字ごとに 1 手にすると、セルに一言打っただけで undo を何度も押す羽目になる。
   * 貼り付け・行の挿入削除のような構造の変更は識別子を渡さず、常に別の手にする。
   */
  readonly key?: string;
}

/** past の既定上限。深すぎる履歴の際限ないメモリ増加を防ぐ。 */
const DEFAULT_CAP = 100;

/** 現在値だけを持つ初期履歴。 */
export function initHistory(present: string): GridHistory {
  return { past: [], present, future: [] };
}

export function canUndo(h: GridHistory): boolean {
  return h.past.length > 0;
}

export function canRedo(h: GridHistory): boolean {
  return h.future.length > 0;
}

/**
 * 新しいスナップショットを積む。現在値と同じなら何もしない（no-op）。
 * 新しい編集が入ったら redo 候補（future）は破棄する。past は cap を超えたら
 * 古い方から捨てる。
 *
 * `key` が直前と同じときは past へ積まず present だけ差し替える（同じセルの打鍵を
 * 1 手にまとめる）。
 */
export function pushHistory(h: GridHistory, next: string, opts: PushOptions = {}): GridHistory {
  if (next === h.present) return h;
  const { cap = DEFAULT_CAP, key } = opts;
  if (key !== undefined && key === h.key) {
    return { past: h.past, present: next, future: [], key };
  }
  const grown = [...h.past, h.present];
  const past = grown.length > cap ? grown.slice(grown.length - cap) : grown;
  return { past, present: next, future: [], key };
}

/**
 * 履歴が保持している文字数の合計。
 *
 * 1 手ごとにファイル全文を積むため、大きな検証シートでは上限まで貯まると相当量になる。
 * 診断でこの数字を出せるようにしておく。
 */
export function historyChars(h: GridHistory): number {
  const sum = (acc: number, s: string): number => acc + s.length;
  return h.past.reduce(sum, 0) + h.present.length + h.future.reduce(sum, 0);
}

/** 1 つ前へ戻る。戻せなければ不変。 */
export function undo(h: GridHistory): GridHistory {
  if (h.past.length === 0) return h;
  const prev = h.past[h.past.length - 1] as string;
  return {
    past: h.past.slice(0, -1),
    present: prev,
    future: [h.present, ...h.future],
  };
}

/** undo を取り消して次へ進む。進めなければ不変。 */
export function redo(h: GridHistory): GridHistory {
  if (h.future.length === 0) return h;
  const next = h.future[0] as string;
  return {
    past: [...h.past, h.present],
    present: next,
    future: h.future.slice(1),
  };
}
