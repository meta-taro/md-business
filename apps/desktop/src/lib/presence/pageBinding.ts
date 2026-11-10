/**
 * 画面の位置（エディタのカーソル行・表の選択セル）を、居場所として送る形へ変える
 * （DOM 非依存の純ロジック）。送れない位置は null を返し、呼び手は何も送らない。
 */

import type { MarkdownPlace, TsvPlace } from './place';

/** 表の選択セル（0 始まり）。 */
export interface GridCell {
  row: number;
  col: number;
}

/** 開いたフォルダ基準のパスを repo root 基準にする（prefix は末尾 `/` 付き、root なら空）。 */
export function repoRelativePath(prefix: string, activePath: string): string {
  return prefix + activePath.replace(/\\/g, '/');
}

/** カーソル行（1 始まり）を Markdown の居場所にする。ブランチが無い（detached）ときは空文字。 */
export function markdownPlace(branch: string | null, line: number): MarkdownPlace | null {
  if (!Number.isInteger(line) || line < 1) return null;
  return { kind: 'markdown', branch: branch ?? '', line };
}

/** 居場所を決めるのに要る、表の今の形。 */
export interface GridShape {
  rowIds: readonly string[];
  columns: readonly string[];
  /** データ行の数。これより下は入力用の空行で、居場所にしない。 */
  rowCount: number;
  /** 並べ替え・絞り込みの最中か。行番号がファイルの並びと食い違う。 */
  arranged: boolean;
}

/**
 * 選択セルを TSV の居場所にする。行 ID のある行は ID で、無い行は行番号で指す。
 * 並べ替え・絞り込みの最中は、行 ID の無い行を指せない（見えている番号は相手の番号と違う）。
 */
export function tsvPlace(branch: string | null, grid: GridShape, cell: GridCell): TsvPlace | null {
  const column = grid.columns[cell.col];
  if (column === undefined || !Number.isInteger(cell.row) || cell.row < 0 || cell.row >= grid.rowCount) {
    return null;
  }
  const rowId = grid.rowIds[cell.row];
  if (rowId) return { kind: 'tsv', branch: branch ?? '', rowId, column };
  if (grid.arranged) return null;
  return { kind: 'tsv', branch: branch ?? '', row: cell.row, column };
}
