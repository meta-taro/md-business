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
 */
export function pushHistory(h: GridHistory, next: string, cap: number = DEFAULT_CAP): GridHistory {
  if (next === h.present) return h;
  const grown = [...h.past, h.present];
  const past = grown.length > cap ? grown.slice(grown.length - cap) : grown;
  return { past, present: next, future: [] };
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
