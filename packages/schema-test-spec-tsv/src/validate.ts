import type { TsvDocument } from './parse.js';
import type { ParsedHeader } from './types.js';

/**
 * バリデーション違反の種類（機械判定用の安定コード）。
 */
export type ValidationCode =
  | 'required'
  | 'multiline_not_allowed'
  | 'enum_value'
  | 'date_format'
  | 'datetime_format'
  | 'number_format'
  | 'checkbox_value'
  | 'url_format'
  | 'extra_columns';

/**
 * 1 件のバリデーション違反。位置（データ行 / 列の 0 始まり index）と列名・コード・説明を持つ。
 */
export interface ValidationIssue {
  /** データ行の index（`doc.rows` 基準・0 始まり）。 */
  row: number;
  /** 列の index（`doc.columns` 基準・0 始まり。`extra_columns` は最初の余剰セル index）。 */
  column: number;
  /** 列名（`extra_columns` は空文字）。 */
  columnName: string;
  /** 違反の種類。 */
  code: ValidationCode;
  /** 人間向け説明（日本語）。 */
  message: string;
}

/** 単一行の列（`multiline_text` 以外）で禁止する制御文字（改行・タブ）。 */
const CONTROL_CHARS = /[\n\r\t]/;

/** 十進の整数・小数（指数・カンマ区切りは不可）。 */
const NUMBER_RE = /^[+-]?(\d+(\.\d+)?|\.\d+)$/;

/** `YYYY-MM-DD`。 */
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `YYYY-MM-DD`（区切りは半角空白 or `T`）`HH:MM[:SS]`。 */
const DATETIME_RE = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/;

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** 実在する暦日か（月・日のレンジと閏年を考慮）。 */
function isRealDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12) {
    return false;
  }
  const daysInMonth = [
    31,
    isLeapYear(year) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  const max = daysInMonth[month - 1] as number;
  return day >= 1 && day <= max;
}

function isValidDate(value: string): boolean {
  const m = DATE_RE.exec(value);
  if (!m) {
    return false;
  }
  return isRealDate(Number(m[1]), Number(m[2]), Number(m[3]));
}

function isValidDatetime(value: string): boolean {
  const m = DATETIME_RE.exec(value);
  if (!m) {
    return false;
  }
  if (!isRealDate(Number(m[1]), Number(m[2]), Number(m[3]))) {
    return false;
  }
  const hour = Number(m[4]);
  const minute = Number(m[5]);
  const second = m[6] === undefined ? 0 : Number(m[6]);
  return hour <= 23 && minute <= 59 && second <= 59;
}

function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * 空でないセルを列型で検査し、違反コードを返す（違反なしなら `null`）。
 * `required` と列数整合は呼び出し側で扱うため、ここでは値の型検査のみ。
 */
function checkTypedValue(column: ParsedHeader, value: string): ValidationCode | null {
  // multiline_text 以外は単一行。改行・タブを含めない。
  if (column.type !== 'multiline_text' && CONTROL_CHARS.test(value)) {
    return 'multiline_not_allowed';
  }

  switch (column.type) {
    case 'enum': {
      const allowed = column.enumValues ?? [];
      return allowed.includes(value) ? null : 'enum_value';
    }
    case 'date':
      return column.ui === 'datetime'
        ? isValidDatetime(value)
          ? null
          : 'datetime_format'
        : isValidDate(value)
          ? null
          : 'date_format';
    case 'number':
      return NUMBER_RE.test(value) ? null : 'number_format';
    case 'checkbox':
      return value === 'TRUE' || value === 'FALSE' ? null : 'checkbox_value';
    case 'url':
      return isValidUrl(value) ? null : 'url_format';
    case 'text':
    case 'multiline_text':
      return null;
  }
}

const MESSAGES: Record<ValidationCode, string> = {
  required: '必須列が空です',
  multiline_not_allowed: '単一行の列に改行またはタブを含められません',
  enum_value: '選択肢に含まれない値です',
  date_format: '日付は YYYY-MM-DD 形式の実在する日付にしてください',
  datetime_format: '日時は YYYY-MM-DD HH:MM[:SS] 形式にしてください',
  number_format: '数値として解釈できません',
  checkbox_value: 'チェックボックスは TRUE / FALSE / 空のいずれかです',
  url_format: 'http:// または https:// の URL にしてください',
  extra_columns: '列数を超えるセルがあります',
};

/**
 * `TsvDocument` の各データセルを列型で検査し、違反の一覧を行優先順で返す純関数。
 *
 * 検査規則:
 * - 空セルは未入力＝正本。`required` 列のときだけ `required` を報告し、型検査はしない。
 * - `multiline_text` 以外の列に改行/タブが含まれたら `multiline_not_allowed`。
 * - enum / date / datetime(ui) / number / checkbox / url は型ごとに値を検査。
 * - 行のセル数が列数を超えたら、最初の余剰セル位置に `extra_columns`（不足は許容）。
 *
 * 位置は `row`（`doc.rows` の index）と `column`（`doc.columns` の index）で表す。
 */
export function validateTsv(doc: TsvDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const columnCount = doc.columns.length;

  doc.rows.forEach((row, rowIndex) => {
    const cellCount = Math.min(row.length, columnCount);

    for (let colIndex = 0; colIndex < cellCount; colIndex += 1) {
      const column = doc.columns[colIndex] as ParsedHeader;
      const value = row[colIndex] as string;

      if (value === '') {
        if (column.required) {
          issues.push({
            row: rowIndex,
            column: colIndex,
            columnName: column.name,
            code: 'required',
            message: MESSAGES.required,
          });
        }
        continue;
      }

      const code = checkTypedValue(column, value);
      if (code !== null) {
        issues.push({
          row: rowIndex,
          column: colIndex,
          columnName: column.name,
          code,
          message: MESSAGES[code],
        });
      }
    }

    if (row.length > columnCount) {
      issues.push({
        row: rowIndex,
        column: columnCount,
        columnName: '',
        code: 'extra_columns',
        message: MESSAGES.extra_columns,
      });
    }
  });

  return issues;
}
