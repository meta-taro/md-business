/**
 * 検証グリッドの行の間引き（見えている範囲だけを描く）。
 * ------------------------------------------------------------------
 * 表は 1 セル確定するたびに組み直される。全行を DOM へ出していると、2,000 行の
 * シートでは 1 回の確定に 0.5 秒以上かかり、確定した手応えが返ってこない。
 *
 * セルは折り返さない（`.cell-view` は nowrap）ので、行の高さは宣言した値どおりに
 * 確定する。実測へ頼らず足し算だけで窓の位置と詰め物の高さを出せるため、ここは
 * DOM 非依存の純関数として持つ。
 */

/**
 * 見えている範囲の前後に余分に描く行数。
 * 余分が無いと、スクロールのたびに端の行が空白として一瞬見える。
 */
export const OVERSCAN_ROWS = 8;

/** ある行の上端が表の先頭から何 px かを返す。並びに無い行は既定高で数える。 */
export function rowOffset(heights: readonly number[], defaultHeight: number, row: number): number {
  let offset = 0;
  for (let r = 0; r < row; r += 1) offset += heights[r] ?? defaultHeight;
  return offset;
}

export interface RowWindowInput {
  /** 行ごとの高さ（px）。実データ行より短いことがある。 */
  heights: readonly number[];
  /** 描く対象の行数（実データ行 + 末尾の空行）。 */
  total: number;
  defaultHeight: number;
  scrollTop: number;
  /** 表示領域の高さ。まだ測れていなければ 0。 */
  viewportHeight: number;
  overscan?: number;
}

/** 描く範囲と、その前後を埋める詰め物の高さ。 */
export interface RowWindow {
  /** 描き始める行（含む）。 */
  start: number;
  /** 描き終わる行の次（含まない）。 */
  end: number;
  /** 上の詰め物の高さ（px）。 */
  topPad: number;
  /** 下の詰め物の高さ（px）。 */
  bottomPad: number;
}

/**
 * いま描くべき行の範囲を求める。
 *
 * 詰め物の高さは「描かない行の高さの合計」そのものにする。表全体の高さが間引きの
 * 有無で変わらないので、スクロールバーの長さも掴んだ位置も動かない。
 */
export function rowWindow(input: RowWindowInput): RowWindow {
  const { heights, defaultHeight, scrollTop, viewportHeight } = input;
  const total = Math.max(0, input.total);
  const overscan = Math.max(0, input.overscan ?? OVERSCAN_ROWS);
  if (total === 0) return { start: 0, end: 0, topPad: 0, bottomPad: 0 };

  const heightAt = (row: number): number => heights[row] ?? defaultHeight;

  // 表示領域の上端に掛かる行まで送る。
  let offset = 0;
  let first = 0;
  while (first < total && offset + heightAt(first) <= scrollTop) {
    offset += heightAt(first);
    first += 1;
  }

  // 下端を越えるまで進める。
  const bottom = scrollTop + Math.max(0, viewportHeight);
  let last = first;
  let filled = offset;
  while (last < total && filled < bottom) {
    filled += heightAt(last);
    last += 1;
  }

  const start = Math.max(0, first - overscan);
  const end = Math.min(total, last + overscan);

  let topPad = 0;
  for (let r = 0; r < start; r += 1) topPad += heightAt(r);
  let bottomPad = 0;
  for (let r = end; r < total; r += 1) bottomPad += heightAt(r);

  return { start, end, topPad, bottomPad };
}

export interface ScrollToRowInput {
  heights: readonly number[];
  defaultHeight: number;
  row: number;
  scrollTop: number;
  viewportHeight: number;
}

/**
 * ある行を表示領域へ入れるためのスクロール位置を返す。すでに見えているなら今の位置のまま。
 *
 * 間引いている間、窓の外の行は DOM に無い＝焦点を当てて自動で寄せてもらうことができない。
 * キーボードで表の外へ出たときは、ここで求めた位置へ先に送ってから焦点を当てる。
 */
export function scrollToRow(input: ScrollToRowInput): number {
  const { heights, defaultHeight, row, scrollTop, viewportHeight } = input;
  const top = rowOffset(heights, defaultHeight, row);
  if (top < scrollTop) return top;
  const bottom = top + (heights[row] ?? defaultHeight);
  if (bottom > scrollTop + viewportHeight) {
    // 行が表示領域より高い場合は下端合わせだと上端が切れる。上端合わせを優先する。
    return Math.min(top, bottom - viewportHeight);
  }
  return scrollTop;
}
