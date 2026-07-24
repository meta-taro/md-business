/**
 * 検証グリッドの列幅レイアウト（Issue 010・スプレのように列幅を調整できるようにする）。
 * ------------------------------------------------------------------
 * 列幅を明示 px として持ち `table-layout: fixed` で描画することで:
 *   - セル選択（input 化）で列幅が動かない（auto-layout が input の固有幅を拾う問題の解）
 *   - ヘッダ境界のドラッグで列幅を自由に調整できる
 *   - 固定幅内で改行セルが折り返し、行高が内容に応じて伸びる
 * 幅の初期値・クランプ・ドラッグ計算を DOM 非依存の純関数として切り出し node で検査する。
 */
import type { ParsedHeader } from '@md-business/schema-test-spec-tsv';
import type { CellWidgetKind } from './gridModel';
import { widgetForColumn } from './gridModel';

/** 列幅の下限（px）。これ未満には縮められない（ヘッダ・ハンドルが潰れるのを防ぐ）。 */
export const MIN_COL_WIDTH = 56;

/** 自動幅（ダブルクリック fit）の上限（px）。長大な内容で列が広がりすぎないよう頭打ち。 */
export const MAX_COL_WIDTH = 560;

/** 型別の既定列幅（px）。値がおおむね収まる幅を型ごとに用意する。 */
const DEFAULT_WIDTH_BY_KIND: Record<CellWidgetKind, number> = {
  checkbox: 64,
  number: 88,
  date: 136,
  datetime: 176,
  radio: 160,
  select: 128,
  url: 208,
  multiline: 256,
  text: 176,
};

/** 1 列分の既定幅を型（+ UI ヒント）から決める。 */
export function defaultColWidth(header: ParsedHeader): number {
  return DEFAULT_WIDTH_BY_KIND[widgetForColumn(header).kind];
}

/** 列定義の並びを既定幅の並びへ写像する（初期レイアウト）。 */
export function defaultColWidths(columns: ParsedHeader[]): number[] {
  return columns.map((header) => defaultColWidth(header));
}

/** 幅を下限でクランプする（端数は丸めて整数 px に）。 */
export function clampColWidth(width: number, min: number = MIN_COL_WIDTH): number {
  return Math.max(min, Math.round(width));
}

/**
 * ドラッグ量から新しい列幅を求める（開始幅 + 移動量、下限クランプ）。
 * ヘッダ境界を掴んで動かした距離 `dx`（px・右が正）を開始幅に足す。
 */
export function resizeColWidth(startWidth: number, dx: number, min: number = MIN_COL_WIDTH): number {
  return clampColWidth(startWidth + dx, min);
}

/**
 * 指定列の幅を更新した **新しい** 配列を返す（入力は不変）。範囲外の index は無視。
 */
export function setColWidth(widths: number[], index: number, width: number): number[] {
  if (index < 0 || index >= widths.length) return widths;
  return widths.map((w, i) => (i === index ? clampColWidth(width) : w));
}

/**
 * 列境界のダブルクリックによる自動幅（fit-to-content）を求める。
 * 実測したセル内容の px 幅群 `contentWidths`（ヘッダ含む）に余白 `padding` を足し、
 * 下限 `min` でクランプ、上限 `max` で頭打ちにする。空列は下限。
 */
export function fitColWidth(
  contentWidths: number[],
  {
    padding = 24,
    min = MIN_COL_WIDTH,
    max = MAX_COL_WIDTH,
  }: { padding?: number; min?: number; max?: number } = {},
): number {
  const widest = contentWidths.length > 0 ? Math.max(...contentWidths) : 0;
  return Math.min(clampColWidth(widest + padding, min), max);
}
