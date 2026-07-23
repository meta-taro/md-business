/**
 * 行単位の差分（Issue 004 Phase 2・update_document のプレビュー用）。
 * -----------------------------------------------------------------------------
 * LCS（最長共通部分列）で「保たれた行 = context / 消えた行 = del / 増えた行 = add」を
 * 求める純ロジック。外部 diff ライブラリを足さず（依存最小）、Markdown 全文の
 * before/after を並べて MCP 応答へそのまま載せられる素朴な形にする。
 */

export type DiffLineType = 'context' | 'add' | 'del';

export interface DiffLine {
  type: DiffLineType;
  text: string;
}

/**
 * before → after の行 diff を返す。LCS を復元し、共通行を context、
 * before 側のみの行を del、after 側のみの行を add として、元の並び順で出力する。
 */
export function diffLines(before: string, after: string): DiffLine[] {
  const a = before.split('\n');
  const b = after.split('\n');
  const n = a.length;
  const m = b.length;

  // 範囲内アクセスのみ行うが noUncheckedIndexedAccess を満たすための既定値ヘルパ。
  const at = (arr: string[], k: number): string => arr[k] ?? '';
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  const len = (r: number, c: number): number => lcs[r]?.[c] ?? 0;

  // lcs[i][j] = a[i..] と b[j..] の最長共通部分列の長さ。
  for (let i = n - 1; i >= 0; i -= 1) {
    const row = lcs[i];
    if (row === undefined) continue;
    for (let j = m - 1; j >= 0; j -= 1) {
      row[j] = at(a, i) === at(b, j) ? len(i + 1, j + 1) + 1 : Math.max(len(i + 1, j), len(i, j + 1));
    }
  }

  const result: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (at(a, i) === at(b, j)) {
      result.push({ type: 'context', text: at(a, i) });
      i += 1;
      j += 1;
    } else if (len(i + 1, j) >= len(i, j + 1)) {
      result.push({ type: 'del', text: at(a, i) });
      i += 1;
    } else {
      result.push({ type: 'add', text: at(b, j) });
      j += 1;
    }
  }
  while (i < n) {
    result.push({ type: 'del', text: at(a, i) });
    i += 1;
  }
  while (j < m) {
    result.push({ type: 'add', text: at(b, j) });
    j += 1;
  }
  return result;
}
