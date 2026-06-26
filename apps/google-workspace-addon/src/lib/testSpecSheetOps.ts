/**
 * test-spec frontmatter ⇔ Google Sheets 双方向同期のための **純粋関数** 層。
 * Why: Apps Script の SpreadsheetApp API は test 環境で mock しづらく、副作用も多い。
 *      Sheets 書き込み計画 / 値→spec 戻し / D-1 確定設計 のバリデーションを
 *      副作用ゼロの中間表現で書き、Apps Script trigger 側はこれを薄く流すだけ。
 */

import type { TestSpec, TestSpecColumn, ColumnType } from '@md-business/schema-test-spec';
import { valuesToMdTable, extractFirstMdTable, parseMdTable } from './mdTable.js';

export type SheetValidationKind =
  | 'unknown_column'
  | 'missing_column'
  | 'enum_out_of_values'
  | 'invalid_date'
  | 'invalid_number'
  | 'number_out_of_range'
  | 'invalid_checkbox'
  | 'invalid_url';

export interface SheetValidationIssue {
  kind: SheetValidationKind;
  /** 1-indexed row in the Sheet (1 = header row). */
  row: number;
  /** 1-indexed column in the Sheet. */
  col: number;
  /** Header name from spec (for missing_column) or sheet (for unknown_column). */
  headerName?: string;
  /** Offending cell value (stringified). */
  cellValue?: string;
}

export interface SheetDataValidationOp {
  columnIndex: number;
  kind: 'list' | 'date' | 'number' | 'checkbox' | 'url';
  values?: string[];
  min?: number;
  max?: number;
}

export interface SheetConditionalFormatOp {
  columnIndex: number;
  scope: 'row' | 'cell';
  matchValue: string;
  color?: string;
  backgroundColor?: string;
}

export interface SheetColumnWidthOp {
  columnIndex: number;
  widthPx: number;
}

export interface SheetColumnWrapOp {
  columnIndex: number;
  wrap: boolean;
}

/** Sheet's default column width in pixels (Google Sheets baseline). */
export const DEFAULT_COLUMN_WIDTH_PX = 100;

export interface SheetWriteOps {
  /** Sheet 名（spec.title をそのまま採用。衝突回避は resolveSheetName で行う）。 */
  sheetName: string;
  headerValues: string[];
  frozenRows: number;
  dataValidations: SheetDataValidationOp[];
  conditionalFormats: SheetConditionalFormatOp[];
  /**
   * Per-column width overrides. Only columns with `widthScale` in spec emit
   * an entry — others keep the Sheet default (100 px). Width = 100 * scale.
   */
  columnWidths: SheetColumnWidthOp[];
  /**
   * Per-column text-wrap directives. Always emitted for every column
   * (default `wrap: true` since Sheets are read by humans). Authors opt out
   * with `折り返し: false` on the column definition.
   */
  columnWraps: SheetColumnWrapOp[];
  /**
   * md 本文 table から抽出した行データ（spec.columns の順に並び替え済み）。
   * body 引数なし / table 抽出失敗 / 列名一致無しなら空配列。
   * Apps Script 側は Sheet 2 行目以降に `setValues(bodyRows)` で書き込む。
   */
  bodyRows: string[][];
}

/**
 * spec.title から sheet 名を決める。
 * 既存 sheet と衝突した場合は ` (2)` ` (3)` …のサフィックスを付与。
 * Apps Script 側は existingNames を渡すだけ、純粋関数として副作用なし。
 */
export function resolveSheetName(
  desiredName: string,
  existingNames: ReadonlyArray<string>,
): string {
  const taken = new Set(existingNames);
  if (!taken.has(desiredName)) return desiredName;
  for (let i = 2; i <= 99; i++) {
    const candidate = `${desiredName} (${i})`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${desiredName} (99)`;
}

/**
 * md 本文の最初の table から bodyRows を抽出し、spec.columns の順に並び替える。
 * md と Sheet で列順が違っても spec.columns 順に揃える（ヘッダー名で照合）。
 * spec に対応する列が table 側に無ければ、その列は空文字で埋める。
 */
function extractBodyRows(columns: ReadonlyArray<TestSpecColumn>, body: string): string[][] {
  const tableSrc = extractFirstMdTable(body);
  if (!tableSrc) return [];
  const table = parseMdTable(tableSrc);
  if (!table) return [];
  const colIndexInMd = columns.map((col) => table.header.indexOf(col.name));
  if (colIndexInMd.every((i) => i < 0)) return [];
  return table.rows.map((row) =>
    colIndexInMd.map((idx) => (idx >= 0 ? row[idx] ?? '' : '')),
  );
}

export function planSheetWriteOps(spec: TestSpec, body?: string): SheetWriteOps {
  const headerValues = spec.columns.map((c) => c.name);
  const dataValidations: SheetDataValidationOp[] = [];
  const conditionalFormats: SheetConditionalFormatOp[] = [];
  const columnWidths: SheetColumnWidthOp[] = [];
  const columnWraps: SheetColumnWrapOp[] = [];
  const bodyRows = body ? extractBodyRows(spec.columns, body) : [];

  spec.columns.forEach((column, columnIndex) => {
    const validation = planValidation(column, columnIndex);
    if (validation) dataValidations.push(validation);

    if (column.type === 'enum' && column.values && column.values.length > 0 && column.visual) {
      for (const [enumValue, style] of Object.entries(column.visual)) {
        if (!column.values.includes(enumValue)) continue;
        if (style.row_background) {
          conditionalFormats.push({
            columnIndex,
            scope: 'row',
            matchValue: enumValue,
            backgroundColor: style.row_background,
          });
        }
        if (style.background || style.color) {
          conditionalFormats.push({
            columnIndex,
            scope: 'cell',
            matchValue: enumValue,
            ...(style.background ? { backgroundColor: style.background } : {}),
            ...(style.color ? { color: style.color } : {}),
          });
        }
      }
    }

    if (typeof column.widthScale === 'number') {
      columnWidths.push({
        columnIndex,
        widthPx: Math.round(DEFAULT_COLUMN_WIDTH_PX * column.widthScale),
      });
    }

    columnWraps.push({ columnIndex, wrap: column.wrap !== false });
  });

  return {
    sheetName: spec.title,
    headerValues,
    frozenRows: 1,
    dataValidations,
    conditionalFormats,
    columnWidths,
    columnWraps,
    bodyRows,
  };
}

function planValidation(
  column: TestSpecColumn,
  columnIndex: number,
): SheetDataValidationOp | null {
  if (column.required === false) return null;
  switch (column.type) {
    case 'enum':
      if (!column.values || column.values.length === 0) return null;
      return { columnIndex, kind: 'list', values: [...column.values] };
    case 'date':
      return { columnIndex, kind: 'date' };
    case 'number':
      return {
        columnIndex,
        kind: 'number',
        ...(column.min !== undefined ? { min: column.min } : {}),
        ...(column.max !== undefined ? { max: column.max } : {}),
      };
    case 'checkbox':
      return { columnIndex, kind: 'checkbox' };
    case 'url':
      return { columnIndex, kind: 'url' };
    case 'text':
    case 'multiline_text':
      return null;
    default:
      return null;
  }
}

export interface ApplySheetResult {
  spec: TestSpec;
  body: string;
}

export function applySheetValuesToSpec(
  spec: TestSpec,
  values: ReadonlyArray<ReadonlyArray<unknown>>,
): ApplySheetResult {
  return {
    spec,
    body: valuesToMdTable(values),
  };
}

/**
 * Sheet values の **末尾の空 row** を削除する。
 *
 * Why: Google Sheets の新規シートは 1000 行のデフォルト空行を持ち、`SpreadsheetApp`
 *      の `getDataRange().getValues()` は checkbox 列のデフォルト値 `false` を
 *      「データあり」と誤判定する。trim せずに md export すると本文 table に
 *      数百〜千行の空 row が混入し、commit が肥大化する (Issue #44)。
 *
 * 仕様:
 * - header (index 0) は常に保持
 * - body row を末尾から走査し、すべてのセルが「空」と判定される連続 row を drop
 * - 中間の空 row (last non-empty より上) は保持
 * - 空判定:
 *   - `null` / `undefined` / 空文字列 / 空白のみ文字列
 *   - checkbox 列のみ: boolean `false` / 文字列 `'FALSE'` / `'false'`
 *   - その他の型 (boolean false on non-checkbox 列、数値 0 など) はデータあり扱い
 */
export function trimTrailingEmptyRows(
  spec: TestSpec,
  values: ReadonlyArray<ReadonlyArray<unknown>>,
): unknown[][] {
  if (values.length === 0) return [];
  const result = values.map((row) => row.slice());
  if (result.length === 1) return result;

  const header = result[0] ?? [];
  const headerNames = header.map((c) => (c === null || c === undefined ? '' : String(c)));
  const specByName = new Map(spec.columns.map((c) => [c.name, c]));
  const checkboxCols = new Set<number>();
  headerNames.forEach((name, idx) => {
    if (specByName.get(name)?.type === 'checkbox') checkboxCols.add(idx);
  });

  let lastNonEmpty = 0; // header row index
  for (let r = 1; r < result.length; r++) {
    const row = result[r] ?? [];
    let isEmpty = true;
    for (let c = 0; c < row.length; c++) {
      if (!isCellEmptyForTrim(row[c], checkboxCols.has(c))) {
        isEmpty = false;
        break;
      }
    }
    if (!isEmpty) lastNonEmpty = r;
  }
  return result.slice(0, lastNonEmpty + 1);
}

function isCellEmptyForTrim(raw: unknown, isCheckbox: boolean): boolean {
  if (raw === null || raw === undefined) return true;
  if (typeof raw === 'string') {
    if (raw.trim() === '') return true;
    if (isCheckbox) {
      const v = raw.trim().toUpperCase();
      if (v === 'FALSE') return true;
    }
    return false;
  }
  if (isCheckbox && raw === false) return true;
  return false;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const BOOLEAN_STRINGS = new Set(['TRUE', 'FALSE', 'true', 'false', '']);

export function validateSheetValues(
  spec: TestSpec,
  values: ReadonlyArray<ReadonlyArray<unknown>>,
): SheetValidationIssue[] {
  if (values.length === 0) return [];

  const issues: SheetValidationIssue[] = [];
  const header = values[0] ?? [];
  const headerNames = header.map((c) => (c === null || c === undefined ? '' : String(c)));
  const specByName = new Map(spec.columns.map((c) => [c.name, c]));

  headerNames.forEach((name, idx) => {
    if (!specByName.has(name) && name !== '') {
      issues.push({
        kind: 'unknown_column',
        row: 1,
        col: idx + 1,
        headerName: name,
      });
    }
  });

  for (const column of spec.columns) {
    if (!headerNames.includes(column.name)) {
      issues.push({
        kind: 'missing_column',
        row: 1,
        col: 0,
        headerName: column.name,
      });
    }
  }

  const colMap = headerNames.map((name) => specByName.get(name));

  for (let r = 1; r < values.length; r++) {
    const row = values[r] ?? [];
    for (let c = 0; c < headerNames.length; c++) {
      const column = colMap[c];
      if (!column) continue;
      const raw = row[c];
      const issue = validateCell(column, raw, r + 1, c + 1);
      if (issue) issues.push(issue);
    }
  }

  return issues;
}

function validateCell(
  column: TestSpecColumn,
  raw: unknown,
  row: number,
  col: number,
): SheetValidationIssue | null {
  if (raw === null || raw === undefined || raw === '') return null;

  switch (column.type) {
    case 'enum':
      return validateEnumCell(column, raw, row, col);
    case 'date':
      return validateDateCell(raw, row, col);
    case 'number':
      return validateNumberCell(column, raw, row, col);
    case 'checkbox':
      return validateCheckboxCell(raw, row, col);
    case 'url':
      return validateUrlCell(raw, row, col);
    case 'text':
    case 'multiline_text':
      return null;
    default:
      return null;
  }
}

function validateEnumCell(
  column: TestSpecColumn,
  raw: unknown,
  row: number,
  col: number,
): SheetValidationIssue | null {
  if (!column.values || column.values.length === 0) return null;
  const value = String(raw);
  if (column.values.includes(value)) return null;
  return { kind: 'enum_out_of_values', row, col, cellValue: value };
}

function validateDateCell(raw: unknown, row: number, col: number): SheetValidationIssue | null {
  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime())
      ? { kind: 'invalid_date', row, col, cellValue: '(invalid Date)' }
      : null;
  }
  const value = String(raw);
  return ISO_DATE.test(value) ? null : { kind: 'invalid_date', row, col, cellValue: value };
}

function validateNumberCell(
  column: TestSpecColumn,
  raw: unknown,
  row: number,
  col: number,
): SheetValidationIssue | null {
  const num = typeof raw === 'number' ? raw : Number(raw);
  if (Number.isNaN(num)) {
    return { kind: 'invalid_number', row, col, cellValue: String(raw) };
  }
  if (column.min !== undefined && num < column.min) {
    return { kind: 'number_out_of_range', row, col, cellValue: String(raw) };
  }
  if (column.max !== undefined && num > column.max) {
    return { kind: 'number_out_of_range', row, col, cellValue: String(raw) };
  }
  return null;
}

function validateCheckboxCell(
  raw: unknown,
  row: number,
  col: number,
): SheetValidationIssue | null {
  if (typeof raw === 'boolean') return null;
  const value = String(raw);
  return BOOLEAN_STRINGS.has(value)
    ? null
    : { kind: 'invalid_checkbox', row, col, cellValue: value };
}

function validateUrlCell(raw: unknown, row: number, col: number): SheetValidationIssue | null {
  const value = String(raw);
  return /^https?:\/\//.test(value) ? null : { kind: 'invalid_url', row, col, cellValue: value };
}

export type { ColumnType };
