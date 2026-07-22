/**
 * スプレッドシート風のセル間移動ロジック（Issue 010・検証グリッド）。
 * ------------------------------------------------------------------
 * キーボード操作でアクティブセルを動かす純関数。DOM / Svelte 非依存で、
 * node 環境の vitest で全分岐を検査する。TsvGrid はキーイベントを
 * NavIntent へ写して呼ぶだけ（薄い糊）。
 *
 * 方針: 矢印・Enter は端でクランプ（ラップしない）。Tab は行を跨いで折り返す
 * （データ入力で右へ流していける表計算の慣習）。Home/End は行内、Ctrl 併用で表全体。
 */

export interface CellPos {
  row: number;
  col: number;
}

export interface GridDims {
  rows: number;
  cols: number;
}

/** キーボード由来の移動意図（DOM KeyboardEvent から key/shift/ctrl を写す）。 */
export interface NavIntent {
  key: string;
  shift?: boolean;
  ctrl?: boolean;
}

function clamp(value: number, max: number): number {
  if (value < 0) return 0;
  if (value > max) return max;
  return value;
}

/**
 * 現在位置と移動意図から次のアクティブセルを返す。移動キーでなければ null
 * （呼び出し側はその場合 preventDefault せず既定動作に委ねる）。
 */
export function nextCell(pos: CellPos, intent: NavIntent, dims: GridDims): CellPos | null {
  const maxRow = dims.rows - 1;
  const maxCol = dims.cols - 1;
  if (maxRow < 0 || maxCol < 0) return null; // 空グリッド

  // 開始位置も範囲内へ丸めてから動かす（不正な入力に強くする）。
  const row = clamp(pos.row, maxRow);
  const col = clamp(pos.col, maxCol);
  const shift = intent.shift ?? false;
  const ctrl = intent.ctrl ?? false;

  switch (intent.key) {
    case 'ArrowDown':
      return { row: clamp(row + 1, maxRow), col };
    case 'ArrowUp':
      return { row: clamp(row - 1, maxRow), col };
    case 'ArrowRight':
      return { row, col: clamp(col + 1, maxCol) };
    case 'ArrowLeft':
      return { row, col: clamp(col - 1, maxCol) };
    case 'Enter':
      return { row: clamp(shift ? row - 1 : row + 1, maxRow), col };
    case 'Tab':
      return tabMove(row, col, shift, dims);
    case 'Home':
      return ctrl ? { row: 0, col: 0 } : { row, col: 0 };
    case 'End':
      return ctrl ? { row: maxRow, col: maxCol } : { row, col: maxCol };
    default:
      return null;
  }
}

/** Tab / Shift+Tab: 線形インデックスで ±1 し、行を跨いで折り返す（端はクランプ）。 */
function tabMove(row: number, col: number, shift: boolean, dims: GridDims): CellPos {
  const index = row * dims.cols + col;
  const last = dims.rows * dims.cols - 1;
  const target = clamp(shift ? index - 1 : index + 1, last);
  return { row: Math.floor(target / dims.cols), col: target % dims.cols };
}
