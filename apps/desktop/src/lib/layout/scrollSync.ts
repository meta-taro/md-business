/**
 * エディター → プレビューのスクロール／フォーカス追従（純ロジック）。
 *
 * 方針（田中さん案・2026-07-22 確定）: 「フォーカス位置（＝カーソル行、スクロール時は
 * 表示領域の先頭行）の文言を、プレビュー内で検索して、その位置へ合わせる」。
 *
 * なぜ見出しアンカーでなく文字検索か:
 * - データ駆動スキーマ（invoice / db-spec / nosql-db-spec / api-spec）は frontmatter を
 *   構造化描画するので本文に見出しが無い＝見出しアンカーは成立しない。だが YAML の値
 *   （フィールド名 `orderId`・参照 `API-2026-0001#orders.order_id` 等）はプレビューにも
 *   逐語で現れる。よって「行の文言をプレビューで検索」なら全スキーマで対応が取れる。
 * - 素朴な割合同期はプレビューが縦に肉厚なぶん下ほどズレる。文字検索なら位置が実体に
 *   固定される。
 *
 * この純ロジックは DOM・iframe・CodeMirror に触れず、
 *   1. 行 → 検索語の抽出（extractSearchTokens）
 *   2. フォーカス行から近傍へ広げる探索順（candidateLines）
 *   3. 同語が複数ヒットしたときの比率位置での絞り込み（pickNearestY）
 * だけを担う。呼び出し側（markdownEditor / +page）が CodeMirror からフォーカス行を、
 * プレビュー iframe から一致位置 Y を実測してここへ渡す。
 */

/** エディターがフォーカス／スクロールのたびに親へ渡す情報。 */
export interface EditorFocusInfo {
  /** フォーカス行（1 始まり）。カーソル行、スクロール時は表示領域の先頭行。 */
  focusLine: number;
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

/** 0..1 にクランプ。NaN は 0 に倒す。 */
function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/**
 * スクロール位置を 0..1 の割合へ換算する。可能スクロール域
 * （scrollHeight - clientHeight）が 0 以下（内容が枠に収まる）なら 0。
 * 文字検索の当たりが無いときのフォールバック、および複数ヒットの絞り込み基準に使う。
 */
export function scrollFraction(
  scrollTop: number,
  scrollHeight: number,
  clientHeight: number,
): number {
  const max = scrollHeight - clientHeight;
  if (max <= 0) return 0;
  return clamp01(scrollTop / max);
}

/**
 * 0..1 の割合を対象要素のスクロール量へ戻す。スクロール不能なら 0。
 */
export function targetScrollTop(
  fraction: number,
  scrollHeight: number,
  clientHeight: number,
): number {
  const max = scrollHeight - clientHeight;
  if (max <= 0) return 0;
  return clamp01(fraction) * max;
}

/**
 * 検索語を整える。前後の全体を囲む括弧／引用符を外し、Markdown のインライン装飾を落とす。
 * （値 `[orders]` → `orders`、`**強調**` → `強調`）。
 */
function cleanToken(raw: string): string {
  let s = raw.trim();
  s = s.replace(/^\[(.*)\]$/, '$1'); // 全体を囲む [ ] のみ外す
  s = s.replace(/^"(.*)"$/, '$1');
  s = s.replace(/^'(.*)'$/, '$1');
  // `_` は snake_case 識別子（order_id 等・検索の要）を壊すので剥がさない。
  s = s.replace(/[`*~]/g, '');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

/**
 * ソース 1 行から、プレビュー検索に使う候補語を「distinctive な順」に返す。
 * - `key: value` 形式は値を優先（フィールド名・ID など逐語一致しやすい）。値が空ならキー。
 * - 見出し `#`・リスト `-`・インデントは剥がす。
 * - 空行・区切り `---`・フェンス ``` は語を出さない。
 * - 長さ 2 未満の語は雑音として捨てる。
 *
 * 例: `名前: orderId` → ["orderId", "名前: orderId"] / `## 概要` → ["概要"]
 *     `タグ: [orders]` → ["orders", "タグ: [orders]"] / `型: 文字列` → ["文字列", "型: 文字列"]
 *   （"文字列" はプレビューでは "string" に訳されるので一致せず、近傍行へフォールバックする）
 */
export function extractSearchTokens(rawLine: string): string[] {
  let line = rawLine.replace(/^\s+/, '');
  line = line.replace(/^[-*+]\s+/, ''); // リストマーカー
  line = line.replace(/^#{1,6}\s+/, ''); // 見出し
  line = line.trim();
  if (line === '' || /^-{3,}$/.test(line) || /^`{3,}/.test(line) || /^~{3,}/.test(line)) {
    return [];
  }

  const tokens: string[] = [];
  const push = (t: string): void => {
    if (t.length >= 2 && !tokens.includes(t)) tokens.push(t);
  };

  // key: value（最初のコロンで分割。キーが長すぎる＝URL 等の誤分割は避ける）。
  const kv = line.match(/^([^:]{1,40}):\s*(.*)$/);
  if (kv) {
    const value = cleanToken(kv[2]);
    if (value.length >= 2) push(value);
    else push(cleanToken(kv[1])); // 値が空 → キーを検索語に（見出し的な行）
  }
  // 末尾コロンだけ落とした行全体もフォールバック候補に加える。
  push(cleanToken(line.replace(/:\s*$/, '')));
  return tokens;
}

/**
 * フォーカス行を起点に、近傍へ広げた探索順（1 始まり行番号）を返す。
 * フォーカス行 → 下方向 → 上方向の順（スクロール時の「先頭行」意味論に合わせ、
 * 画面に見えている下側を先に当てる）。範囲外・重複は除く。
 */
export function candidateLines(
  focusLine: number,
  totalLines: number,
  window = 6,
): number[] {
  const out: number[] = [];
  const push = (n: number): void => {
    if (n >= 1 && n <= totalLines && !out.includes(n)) out.push(n);
  };
  push(focusLine);
  for (let d = 1; d <= window; d++) {
    push(focusLine + d);
    push(focusLine - d);
  }
  return out;
}

/**
 * 同じ語が複数箇所でヒットしたとき、比率で推定した期待位置に最も近い Y を選ぶ
 * （逐語一致の堅さに、割合同期を絞り込みの手掛かりとして重ねる）。空なら null。
 */
export function pickNearestY(ys: readonly number[], expectedY: number): number | null {
  let best: number | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const y of ys) {
    const dist = Math.abs(y - expectedY);
    if (dist < bestDist) {
      bestDist = dist;
      best = y;
    }
  }
  return best;
}
