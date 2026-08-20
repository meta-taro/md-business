/**
 * セル内の生改行で割れた行の知らせ（純粋な層）。
 *
 * 割れた行は、見た目には「短い行が 2 本並んでいる」だけで、赤も出ないまま表として成立する。
 * セルの赤だけに任せると、割れた側の行は空セルが並ぶので目が滑る。**開いた直後に上へ出す**。
 *
 * 消えない知らせにはしない。直せるのは書いた本人で、ここでは直せないため、見たあとも
 * ずっと居座ると邪魔になる。閉じたのはそのシートについてだけで、別のシートを開けば出し直す。
 */

/** 割れた疑いを表す検証結果の種別。 */
const SPLIT_CODE = 'short_row';

/** 検証結果のうち、ここで見るぶんだけ。 */
interface RowIssue {
  row: number;
  code: string;
}

/** 割れた疑いのある行を昇順・重複なしで返す。 */
export function splitRows(issues: readonly RowIssue[]): number[] {
  const rows = new Set<number>();
  for (const issue of issues) {
    if (issue.code === SPLIT_CODE) rows.add(issue.row);
  }
  return [...rows].sort((a, b) => a - b);
}

/**
 * 知らせを出すか。
 *
 * `dismissed` は閉じた時点のシート。いま開いているシートと違えば、別の表なので出し直す。
 * 名前の無いシート（保存前）は互いに見分けられないので、閉じたら出さないほうへ倒す。
 */
export function showsSplitNotice(
  rows: readonly number[],
  sheetKey: string | null,
  dismissed: string | null,
): boolean {
  if (rows.length === 0) return false;
  if (dismissed === null) return true;
  // 保存前のシートは名前が無い。閉じた印は空文字で置く（null は「まだ閉じていない」）。
  return (sheetKey ?? '') !== dismissed;
}

/** いまの行より後の最初の割れ目へ送る。最後まで行ったら先頭へ戻る。無ければ null。 */
export function nextSplitRow(rows: readonly number[], from: number): number | null {
  if (rows.length === 0) return null;
  return rows.find((row) => row > from) ?? rows[0] ?? null;
}
