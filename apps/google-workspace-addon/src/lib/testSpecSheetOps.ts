/**
 * test-spec frontmatter ⇔ Google Sheets 双方向同期のための **純粋関数** 層。
 * Why: Apps Script の SpreadsheetApp API は test 環境で mock しづらく、副作用も多い。
 *      Sheets 書き込み計画 / 値→spec 戻し / D-1 確定設計 のバリデーションを
 *      副作用ゼロの中間表現で書き、Apps Script trigger 側はこれを薄く流すだけ。
 */

import type { TestSpec, TestSpecColumn, ColumnType } from '@md-business/schema-test-spec';
import { valuesToMdTable } from './mdTable.js';

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

export interface SheetWriteOps {
  headerValues: string[];
  frozenRows: number;
  dataValidations: SheetDataValidationOp[];
  conditionalFormats: SheetConditionalFormatOp[];
}

export function planSheetWriteOps(spec: TestSpec): SheetWriteOps {
  const headerValues = spec.columns.map((c) => c.name);
  const dataValidations: SheetDataValidationOp[] = [];
  const conditionalFormats: SheetConditionalFormatOp[] = [];

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
  });

  return {
    headerValues,
    frozenRows: 1,
    dataValidations,
    conditionalFormats,
  };
}

function planValidation(
  column: TestSpecColumn,
  columnIndex: number,
): SheetDataValidationOp | null {
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
