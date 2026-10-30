import {
  classifyLine,
  computedCellValue,
  escapeCell,
  lockedColumns,
  parseTsv,
  readComputedColumns,
  readHiddenIds,
  rowIdColumnName,
  type ColumnType,
} from '@md-business/schema-test-spec-tsv';

import { isTestSpecTsv } from '../tsvDiagnostics.js';

export interface GridColumn {
  /** ファイル上の列位置。表示しない ID 列を飛ばすので、表示順の位置とは限らない。 */
  index: number;
  name: string;
  type: ColumnType;
  required: boolean;
  /** 値がほかから決まる列（`#@ computed`）。表からは書き換えさせない。 */
  locked: boolean;
  options?: string[];
}

export interface GridRow {
  /** 0 始まりの物理行。書き戻しはこの 1 行だけを差し替える。 */
  line: number;
  /** 表示する列ぶんのセル（unescape 済み）。 */
  cells: string[];
  /** 行 ID（ID 列のあるシートだけ）。書き戻す前に、同じ行かを確かめるのに使う。 */
  id?: string;
}

export interface GridModel {
  title: string;
  columns: GridColumn[];
  rows: GridRow[];
}

/**
 * 検証シートを表として見せる形にする。マーカーの無い TSV は null。
 *
 * 行 ID 列と、控えにした行（`#@ hidden`）は出さない。どちらも利用者が表の上で
 * 触るものではなく、出すと打ち換えられてしまう。計算列は算出値を見せる。
 * 番号は表に出ている行で数える（デスクトップアプリの表と揃える）。
 */
export function gridModel(text: string): GridModel | null {
  if (!isTestSpecTsv(text)) return null;

  const doc = parseTsv(text);
  const names = doc.columns.map((c) => c.name);
  const idIndex = names.indexOf(rowIdColumnName(doc.directives, names) ?? '');
  const computed = readComputedColumns(doc.directives, names);
  const locked = lockedColumns(computed);
  const hidden = new Set(readHiddenIds(doc.directives));

  const columns: GridColumn[] = doc.columns.flatMap((c, index) =>
    index === idIndex
      ? []
      : [
          {
            index,
            name: c.name,
            type: c.type,
            required: c.required,
            locked: locked.has(index),
            ...(c.enumValues === undefined ? {} : { options: c.enumValues }),
          },
        ],
  );

  // parseTsv は物理行の位置を捨てるので、data 行の位置をこちらで拾い直す。
  const dataLines: number[] = [];
  text.split('\n').forEach((raw, line) => {
    if (classifyLine(raw.replace(/\r$/, '')) === 'data') dataLines.push(line);
  });
  const rowLines = dataLines.slice(1); // 先頭の data 行はヘッダ

  const visible = doc.rows
    .map((cells, i) => ({ cells, line: rowLines[i] ?? -1 }))
    .filter(({ cells }) => idIndex < 0 || !hidden.has(cells[idIndex] ?? ''));

  const rows = visible.map(({ cells, line }, rowIndex) => ({
    line,
    ...(idIndex < 0 ? {} : { id: cells[idIndex] ?? '' }),
    cells: columns.map((column) => {
      const rule = computed.find((c) => c.columnIndex === column.index);
      const derived = rule === undefined ? null : computedCellValue(rule.formula, rowIndex);
      return derived ?? cells[column.index] ?? '';
    }),
  }));

  return { title: doc.meta['タイトル'] ?? '', columns, rows };
}

/**
 * 1 物理行のうち 1 セルだけを差し替えた行を返す。
 *
 * ほかのセルは書かれたまま（エスケープも含めて）残す。全体を組み直すと、
 * 触っていない行やメタ行の書き癖まで変わり、差分が読めなくなる。
 */
export function withCellValue(lineText: string, column: number, value: string): string {
  const cells = lineText.split('\t');
  while (cells.length <= column) cells.push('');
  cells[column] = escapeCell(value);
  return cells.join('\t');
}

export interface CellEdit {
  /** 表が示していた物理行。 */
  line: number;
  /** ファイル上の列位置（GridColumn.index）。 */
  column: number;
  /** 表が示していた値。 */
  before: string;
  value: string;
  id?: string;
}

export interface LineReplacement {
  line: number;
  text: string;
}

/**
 * 表からの書き込みを、差し替える 1 行に変える。通せないときは null。
 *
 * 表は少し前の内容を映しているだけなので、その間にテキスト側で行が挿されたり
 * 値が変わったりしていることがある。行 ID（あれば）と、表が示していた値の両方が
 * 今のファイルと合うときだけ書く。合わなければ書かずに表を描き直させる。
 */
export function planEdit(text: string, edit: CellEdit): LineReplacement | null {
  const model = gridModel(text);
  if (model === null) return null;

  const position = model.columns.findIndex((c) => c.index === edit.column);
  const column = model.columns[position];
  if (column === undefined || column.locked) return null;

  const row = model.rows.find((r) => r.line === edit.line);
  if (row === undefined || row.id !== edit.id) return null;
  if (row.cells[position] !== edit.before) return null;

  const lineText = (text.split('\n')[edit.line] ?? '').replace(/\r$/, '');
  return { line: edit.line, text: withCellValue(lineText, edit.column, edit.value) };
}
