/**
 * 検証シートを表の上で直すための書き換え。純関数（DOM を触らない）。
 *
 * ファイル全体を組み直して書き出すのではなく、**触った物理行だけを差し替える**。
 * 組み直すとメタ行の並び・自由なコメント・空行・控えの行の位置まで正規化され、
 * セル 1 つ直しただけで差分がファイル全体に広がる。
 *
 * 行と列の番号は表に出ている並びで受ける（控えの行と ID 列を数えない）。
 * 表示側はこの並びしか知らないので、物理行への読み替えはここで閉じる。
 */
import {
  classifyLine,
  computedCellValue,
  escapeCell,
  generateRowId,
  parseTsv,
  readComputedColumns,
  readHiddenIds,
  rowIdColumnName,
  unescapeCell,
  withRowIds,
  type ColumnType,
  type ComputedColumn,
} from '@md-business/schema-test-spec-tsv';

const BOM = '﻿';
const CHECKBOX_CHOICES = ['TRUE', 'FALSE'];

/** 表の 1 列ぶんの編集のしかた。 */
export interface EditColumn {
  name: string;
  type: ColumnType;
  /** 選ばせる値（enum / checkbox）。選択肢を持たない列は空。 */
  choices: string[];
  /** 日時まで持つ日付列か。 */
  datetime: boolean;
  /** 値がほかから決まる列（`#@ computed`）。打たせない。 */
  locked: boolean;
}

/** 物理行に分けたシート。書き戻すときに改行と BOM を元どおりにする。 */
interface SheetLines {
  bom: boolean;
  eol: '\n' | '\r\n';
  lines: string[];
}

/** 表の並びと物理行の対応。 */
interface SheetLayout {
  /** ヘッダ行の位置。ヘッダが無ければ -1。 */
  headerLine: number;
  /** 表に出る行 → 物理行。 */
  visibleLines: number[];
  /** データ行（控え含む）の最後の物理行。無ければ -1。 */
  lastDataLine: number;
  /** 表に出る列 → ファイル上の列。 */
  physicalColumns: number[];
  /** ファイル上の列数。 */
  width: number;
  /** ID 列の位置。無ければ -1。 */
  idColumn: number;
  /** 計算列（表に出る列の並びで指す）。 */
  computed: ComputedColumn[];
}

function splitSheet(source: string): SheetLines {
  const bom = source.startsWith(BOM);
  const body = bom ? source.slice(1) : source;
  const eol = body.includes('\r\n') ? '\r\n' : '\n';
  return { bom, eol, lines: body.split('\n').map((line) => line.replace(/\r$/, '')) };
}

function joinSheet(sheet: SheetLines): string {
  return `${sheet.bom ? BOM : ''}${sheet.lines.join(sheet.eol)}`;
}

function layoutOf(lines: readonly string[]): SheetLayout {
  const parsed = parseTsv(lines.join('\n'));
  const names = parsed.columns.map((column) => column.name);
  const idName = rowIdColumnName(parsed.directives, names);
  const idColumn = idName === null ? -1 : names.indexOf(idName);
  const physicalColumns = names.map((_, i) => i).filter((i) => i !== idColumn);
  const visibleNames = physicalColumns.map((i) => names[i] as string);

  // 控えの判定は ID で行う。ID 列の無いファイルは控えを持てない（採番は表示の都合）。
  const { rowIds } = withRowIds(parsed);
  const hidden = new Set(idColumn >= 0 ? readHiddenIds(parsed.directives) : []);

  let headerLine = -1;
  let lastDataLine = -1;
  let dataIndex = 0;
  const visibleLines: number[] = [];
  lines.forEach((line, i) => {
    if (classifyLine(line) !== 'data') return;
    if (headerLine < 0) {
      headerLine = i;
      return;
    }
    lastDataLine = i;
    if (!hidden.has(rowIds[dataIndex] ?? '')) visibleLines.push(i);
    dataIndex += 1;
  });

  return {
    headerLine,
    visibleLines,
    lastDataLine,
    physicalColumns,
    width: names.length,
    idColumn,
    computed: readComputedColumns(parsed.directives, visibleNames),
  };
}

function cellsOf(line: string, width: number): string[] {
  const cells = line.split('\t');
  while (cells.length < width) cells.push('');
  return cells;
}

/**
 * 表に出る行の計算列を、行の位置から決まる値へ揃える。
 * 行を足す・消すと後ろの通し番号がずれるので、書き換えのたびに通す。
 * 相手ファイルを読まないと決まらない式は触らない（読めていないだけの値を焼かない）。
 */
function healComputed(lines: string[], layout: SheetLayout): void {
  if (layout.computed.length === 0) return;
  layout.visibleLines.forEach((lineIndex, rowIndex) => {
    const cells = cellsOf(lines[lineIndex] as string, layout.width);
    let changed = false;
    for (const { columnIndex, formula } of layout.computed) {
      const value = computedCellValue(formula, rowIndex);
      const physical = layout.physicalColumns[columnIndex];
      if (value === null || physical === undefined) continue;
      if (cells[physical] === value) continue;
      cells[physical] = value;
      changed = true;
    }
    if (changed) lines[lineIndex] = cells.join('\t');
  });
}

/** 表に出る列の編集のしかた。 */
export function readEditColumns(source: string): EditColumn[] {
  const { lines } = splitSheet(source);
  const parsed = parseTsv(lines.join('\n'));
  const layout = layoutOf(lines);
  const locked = new Set(layout.computed.map((c) => c.columnIndex));

  return layout.physicalColumns.map((physical, index) => {
    const header = parsed.columns[physical];
    const type = header?.type ?? 'text';
    const choices =
      type === 'checkbox' ? [...CHECKBOX_CHOICES] : type === 'enum' ? [...(header?.enumValues ?? [])] : [];
    return {
      name: header?.name ?? '',
      type,
      choices,
      datetime: header?.ui === 'datetime',
      locked: locked.has(index),
    };
  });
}

/**
 * 表の行・列で指したセルの値（セル内の印を戻した素の値）。範囲外は null。
 * 編集欄に出す初期値に使う。描画済みの文字は整形されているので、そこからは読まない。
 */
export function readTsvCell(source: string, row: number, column: number): string | null {
  const { lines } = splitSheet(source);
  const layout = layoutOf(lines);
  const physical = layout.physicalColumns[column];
  const lineIndex = layout.visibleLines[row];
  if (physical === undefined || lineIndex === undefined) return null;
  return unescapeCell(cellsOf(lines[lineIndex] as string, layout.width)[physical] ?? '');
}

/** 新しい行を差し込む位置（データ行の最後の直後、無ければヘッダの直後）。 */
function insertionLine(layout: SheetLayout): number {
  return (layout.lastDataLine >= 0 ? layout.lastDataLine : layout.headerLine) + 1;
}

/** 空の行を組む。ID 列があれば採番して持たせる。 */
function blankRow(layout: SheetLayout, newId: () => string): string[] {
  const cells = new Array<string>(layout.width).fill('');
  if (layout.idColumn >= 0) cells[layout.idColumn] = newId();
  return cells;
}

/**
 * セル 1 つを書き換える。書けない指定（計算列・範囲外）は null。
 *
 * `row` が表の行数ちょうどなら、その値を持つ行を末尾に足す。表示側が「空の行」を
 * 出しておき、最初に打った値でファイルへ入れるための口。空の行はファイルに置くと
 * パーサが読み飛ばして消えるので、値が空なら何もしない。
 */
export function editTsvCell(
  source: string,
  row: number,
  column: number,
  value: string,
  newId: () => string = generateRowId,
): string | null {
  const sheet = splitSheet(source);
  const layout = layoutOf(sheet.lines);
  const physical = layout.physicalColumns[column];
  if (physical === undefined || layout.headerLine < 0) return null;
  if (layout.computed.some((c) => c.columnIndex === column)) return null;
  if (row < 0 || row > layout.visibleLines.length) return null;

  const lines = sheet.lines.slice();
  const escaped = escapeCell(value);

  if (row === layout.visibleLines.length) {
    if (value === '') return source;
    const cells = blankRow(layout, newId);
    cells[physical] = escaped;
    const at = insertionLine(layout);
    lines.splice(at, 0, cells.join('\t'));
    healComputed(lines, layoutOf(lines));
    return joinSheet({ ...sheet, lines });
  }

  const lineIndex = layout.visibleLines[row] as number;
  const cells = cellsOf(lines[lineIndex] as string, layout.width);
  if (cells[physical] === escaped) return source;
  cells[physical] = escaped;
  lines[lineIndex] = cells.join('\t');
  return joinSheet({ ...sheet, lines });
}

/**
 * 空の行を末尾に足す。足しても空の行にしかならない（ID 列も計算列も無い）ときは null。
 * そのときは表示側が空の行を出しておき、{@link editTsvCell} で値ごと入れる。
 */
export function appendTsvRow(source: string, newId: () => string = generateRowId): string | null {
  const sheet = splitSheet(source);
  const layout = layoutOf(sheet.lines);
  if (layout.headerLine < 0) return null;

  const fillsItself =
    layout.idColumn >= 0 ||
    layout.computed.some((c) => computedCellValue(c.formula, 0) !== null);
  if (!fillsItself) return null;

  const lines = sheet.lines.slice();
  lines.splice(insertionLine(layout), 0, blankRow(layout, newId).join('\t'));
  healComputed(lines, layoutOf(lines));
  return joinSheet({ ...sheet, lines });
}

/** 表の行を 1 本消す。範囲外は null。控えの行には触らない。 */
export function deleteTsvRow(source: string, row: number): string | null {
  const sheet = splitSheet(source);
  const layout = layoutOf(sheet.lines);
  const lineIndex = layout.visibleLines[row];
  if (lineIndex === undefined) return null;

  const lines = sheet.lines.slice();
  lines.splice(lineIndex, 1);
  healComputed(lines, layoutOf(lines));
  return joinSheet({ ...sheet, lines });
}
