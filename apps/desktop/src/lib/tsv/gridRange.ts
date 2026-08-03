/**
 * 検証グリッドの矩形範囲選択（検証のしやすさが最大のポイントという UX）。
 * ------------------------------------------------------------------
 * アンカー（起点）とフォーカス（伸長先）の 2 点で矩形を表し、Shift+矢印 / Shift+クリックで
 * 広げ、Ctrl+C でブロックを TSV 化してコピーする。座標計算・直列化を DOM 非依存の純関数で
 * 切り出し node 環境の vitest で検査する。Svelte 側はキー / クリックを受けて呼ぶ薄いグルー。
 */
import type { TsvDocument } from '@md-business/schema-test-spec-tsv';
import type { CellPos, GridDims } from './gridNav';
import { serializeClipboardMatrix } from './clipboardCodec';

/** 選択範囲。anchor＝起点（固定）、focus＝伸長先（Shift で動く角）。 */
export interface CellRange {
  anchor: CellPos;
  focus: CellPos;
}

/** 左上→右下の包含境界（行 r0..r1・列 c0..c1）。 */
export interface RangeBounds {
  r0: number;
  c0: number;
  r1: number;
  c1: number;
}

/** anchor / focus を左上→右下の包含境界へ正規化する。 */
export function rangeBounds(range: CellRange): RangeBounds {
  return {
    r0: Math.min(range.anchor.row, range.focus.row),
    c0: Math.min(range.anchor.col, range.focus.col),
    r1: Math.max(range.anchor.row, range.focus.row),
    c1: Math.max(range.anchor.col, range.focus.col),
  };
}

/** セル (row, col) が範囲内かを判定する。 */
export function isInRange(range: CellRange, row: number, col: number): boolean {
  const { r0, c0, r1, c1 } = rangeBounds(range);
  return row >= r0 && row <= r1 && col >= c0 && col <= c1;
}

/** 範囲が単一セル（anchor と focus が同一）か。 */
export function isSingleCell(range: CellRange): boolean {
  return range.anchor.row === range.focus.row && range.anchor.col === range.focus.col;
}

function clamp(value: number, max: number): number {
  return Math.max(0, Math.min(value, max));
}

/**
 * 行全体（先頭列〜末尾列）を覆う矩形範囲を返す。行番号セルのクリックで使う
 * （行の数字をクリックして行全体を選択できるようにする）。
 * anchor＝先頭列、focus＝末尾列。列が 0 のときは focus 列も 0 でクランプ。
 */
export function rowRange(row: number, colCount: number): CellRange {
  return {
    anchor: { row, col: 0 },
    focus: { row, col: Math.max(0, colCount - 1) },
  };
}

/**
 * focus を移動量ぶん動かした **新しい** 範囲を返す（anchor は固定・入力は不変）。
 * グリッド端でクランプし範囲外へは出ない。Shift+矢印での伸長に使う。
 */
export function extendRange(
  range: CellRange,
  delta: { dr: number; dc: number },
  dims: GridDims,
): CellRange {
  return {
    anchor: range.anchor,
    focus: {
      row: clamp(range.focus.row + delta.dr, dims.rows - 1),
      col: clamp(range.focus.col + delta.dc, dims.cols - 1),
    },
  };
}

/**
 * focus を指定セルへ飛ばした **新しい** 範囲を返す（anchor は固定・入力は不変）。
 * 相対移動の {@link extendRange} に対し、こちらは行頭・行末・表の隅など
 * 移動先が絶対座標で決まる伸長（Shift+Home / Shift+End）に使う。
 */
export function extendRangeTo(range: CellRange, focus: CellPos, dims: GridDims): CellRange {
  return {
    anchor: range.anchor,
    focus: {
      row: clamp(focus.row, dims.rows - 1),
      col: clamp(focus.col, dims.cols - 1),
    },
  };
}

/**
 * グリッド全体を覆う範囲（Ctrl+A の全選択）。
 * 行・列が 0 のときは (0,0) の単一セルに畳む（負の座標を作らない）。
 */
export function wholeRange(dims: GridDims): CellRange {
  return {
    anchor: { row: 0, col: 0 },
    focus: {
      row: Math.max(0, dims.rows - 1),
      col: Math.max(0, dims.cols - 1),
    },
  };
}

/**
 * 矩形範囲をクリップボード用の TSV（行はタブ区切り・行間は改行）へ直列化する。
 * 欠けたセルは空文字で位置を保つ。改行やタブを含むセルの囲みは
 * {@link ./clipboardCodec} が持ち、貼り付け側と同じ判定を共有する。
 */
export function rangeToTsv(doc: TsvDocument, range: CellRange): string {
  const { r0, c0, r1, c1 } = rangeBounds(range);
  const matrix: string[][] = [];
  for (let r = r0; r <= r1; r++) {
    const cells: string[] = [];
    for (let c = c0; c <= c1; c++) {
      cells.push(doc.rows[r]?.[c] ?? '');
    }
    matrix.push(cells);
  }
  // セル内の改行・タブが行区切り・列区切りと混ざらないよう、必要なセルだけ囲む。
  return serializeClipboardMatrix(matrix);
}
