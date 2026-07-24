// 検索の純ロジック（DOM 非依存・vitest 単体テスト層）。
// エディター（CodeMirror）とプレビュー（iframe）で共通の「クエリ→正規表現」変換と
// マッチ間のインデックス移動（前後・ラップ）を提供する。副作用は各バインド層が持つ。

/** 検索オプション（大文字小文字・正規表現・単語単位）。 */
export interface SearchOptions {
  caseSensitive: boolean;
  regex: boolean;
  wholeWord: boolean;
}

/** 既定の検索オプション（すべて無効＝素朴な部分一致）。 */
export const DEFAULT_SEARCH_OPTIONS: SearchOptions = {
  caseSensitive: false,
  regex: false,
  wholeWord: false,
};

/** 正規表現メタ文字をエスケープし、リテラル一致用のパターンにする。 */
export function escapeRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * クエリと検索オプションから、全マッチ走査用の RegExp を組み立てる。
 * - 空クエリは null（＝検索無効）。
 * - regex=false はリテラル扱い（メタ文字エスケープ）。
 * - wholeWord は前後に単語境界 \b を付ける。
 * - 常に global（g）。caseSensitive=false なら ignoreCase（i）。
 * - regex=true で不正なパターンのときは null（呼び出し側で「不正」を表示）。
 */
export function buildSearchRegex(query: string, options: SearchOptions): RegExp | null {
  if (query === '') return null;
  const body = options.regex ? query : escapeRegExp(query);
  const pattern = options.wholeWord ? `\\b(?:${body})\\b` : body;
  const flags = options.caseSensitive ? 'g' : 'gi';
  try {
    return new RegExp(pattern, flags);
  } catch {
    return null;
  }
}

/**
 * text 中の非重複マッチ数を数える。regex は g フラグ前提（buildSearchRegex 由来）。
 * 空マッチ（例: `a*` が空にヒット）で無限ループしないよう lastIndex を前進させる。
 */
export function countMatches(text: string, regex: RegExp | null): number {
  if (regex === null) return 0;
  const re = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : `${regex.flags}g`);
  let count = 0;
  let last = -1;
  for (let m = re.exec(text); m !== null; m = re.exec(text)) {
    count += 1;
    if (re.lastIndex === m.index) re.lastIndex += 1; // 空マッチ対策
    if (re.lastIndex <= last) break; // 念のための停止（後退しない）
    last = re.lastIndex;
  }
  return count;
}

/**
 * 現在のマッチ位置から次／前のマッチ位置へ、端で反対側へ巻き戻して移動する。
 * @param current 現在の 0 始まりインデックス（未選択は -1）
 * @param total マッチ総数
 * @param direction +1=次へ / -1=前へ
 * @returns 移動後の 0 始まりインデックス。total===0 のときは -1。
 */
export function stepMatchIndex(current: number, total: number, direction: 1 | -1): number {
  if (total <= 0) return -1;
  // 未選択(-1)から「次へ」は 0、「前へ」は末尾。
  if (current < 0) return direction === 1 ? 0 : total - 1;
  return (current + direction + total) % total;
}

/**
 * 件数表示用の 1 始まり現在位置。total===0 は 0 を返す（「0/0」→ 呼び出し側で noMatches 表示）。
 */
export function displayIndex(current: number, total: number): number {
  if (total <= 0 || current < 0) return 0;
  return current + 1;
}
