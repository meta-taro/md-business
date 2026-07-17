import { describe, it, expect } from 'vitest';
import { validateTsv } from '../src/validate.js';
import type { TsvDocument } from '../src/parse.js';
import type { ParsedHeader } from '../src/types.js';

/**
 * バリデーション：`TsvDocument`（`parseTsv` の出力）の各データセルを、
 * 対応する列型で検査する純関数（Issue 010・Block TSV-5）。
 *
 * - 空セルは未入力＝正本（`data-cell-conventions`）。`required` 列のときだけ `required` を出す。
 * - 単一行の列（`multiline_text` 以外）に改行/タブが含まれたら不正。
 * - enum / date / datetime / number / checkbox / url は型ごとに値を検査。
 * - 行のセル数が列数を超えたら `extra_columns`（不足は末尾省略として許容）。
 */

/** 最小の TsvDocument を組み立てるヘルパ（meta / directives は空）。 */
function doc(columns: ParsedHeader[], rows: string[][]): TsvDocument {
  return { formatId: '', meta: {}, directives: [], columns, rows };
}

const col = (
  name: string,
  type: ParsedHeader['type'],
  extra: Partial<ParsedHeader> = {},
): ParsedHeader => ({ name, type, required: false, ...extra });

describe('validateTsv', () => {
  it('returns no issues for a well-formed document', () => {
    const d = doc(
      [
        col('項目', 'text'),
        col('手順', 'multiline_text'),
        col('結果', 'enum', { enumValues: ['〇', '×'] }),
        col('実施日', 'date'),
      ],
      [['新規受注', '顧客を入力\n確定を押す', '〇', '2026-06-22']],
    );

    expect(validateTsv(d)).toEqual([]);
  });

  it('returns no issues for an empty document', () => {
    expect(validateTsv(doc([], []))).toEqual([]);
  });

  it('flags an empty cell in a required column', () => {
    const d = doc([col('結果', 'enum', { required: true, enumValues: ['〇', '×'] })], [['']]);

    const issues = validateTsv(d);

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ row: 0, column: 0, columnName: '結果', code: 'required' });
  });

  it('allows an empty cell in a non-required column regardless of type', () => {
    const d = doc(
      [col('実施日', 'date'), col('件数', 'number'), col('結果', 'enum', { enumValues: ['〇'] })],
      [['', '', '']],
    );

    expect(validateTsv(d)).toEqual([]);
  });

  it('flags a newline in a single-line (non-multiline) column', () => {
    const d = doc([col('項目', 'text')], [['一行目\n二行目']]);

    const issues = validateTsv(d);

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ row: 0, column: 0, code: 'multiline_not_allowed' });
  });

  it('flags a tab in a single-line column', () => {
    const d = doc([col('項目', 'text')], [['前\t後']]);

    expect(validateTsv(d)[0]).toMatchObject({ code: 'multiline_not_allowed' });
  });

  it('allows newlines in a multiline_text column', () => {
    const d = doc([col('手順', 'multiline_text')], [['一行目\n二行目\n三行目']]);

    expect(validateTsv(d)).toEqual([]);
  });

  it('flags an enum value outside the declared set', () => {
    const d = doc([col('結果', 'enum', { enumValues: ['〇', '×'] })], [['保留']]);

    expect(validateTsv(d)[0]).toMatchObject({ code: 'enum_value', columnName: '結果' });
  });

  it('accepts a valid ISO date and rejects a malformed / non-existent one', () => {
    const c = [col('実施日', 'date')];
    expect(validateTsv(doc(c, [['2026-06-22']]))).toEqual([]);
    expect(validateTsv(doc(c, [['2024-02-29']]))).toEqual([]); // 閏年の 2/29 は妥当
    expect(validateTsv(doc(c, [['2026-02-29']]))[0]).toMatchObject({ code: 'date_format' }); // 平年は不正
    expect(validateTsv(doc(c, [['2026/06/22']]))[0]).toMatchObject({ code: 'date_format' });
    expect(validateTsv(doc(c, [['2026-02-30']]))[0]).toMatchObject({ code: 'date_format' });
    expect(validateTsv(doc(c, [['2026-13-01']]))[0]).toMatchObject({ code: 'date_format' });
  });

  it('validates a datetime column (ui:datetime) with date-and-time formats', () => {
    const c = [col('実施', 'date', { ui: 'datetime' })];
    expect(validateTsv(doc(c, [['2026-06-22 14:30']]))).toEqual([]);
    expect(validateTsv(doc(c, [['2026-06-22T14:30:05']]))).toEqual([]);
    expect(validateTsv(doc(c, [['2026-06-22']]))[0]).toMatchObject({ code: 'datetime_format' });
    expect(validateTsv(doc(c, [['2026-06-22 25:00']]))[0]).toMatchObject({
      code: 'datetime_format',
    });
    expect(validateTsv(doc(c, [['2026-02-30 12:00']]))[0]).toMatchObject({
      code: 'datetime_format',
    });
  });

  it('validates a number column', () => {
    const c = [col('件数', 'number')];
    expect(validateTsv(doc(c, [['42']]))).toEqual([]);
    expect(validateTsv(doc(c, [['-3.5']]))).toEqual([]);
    expect(validateTsv(doc(c, [['1,000']]))[0]).toMatchObject({ code: 'number_format' });
    expect(validateTsv(doc(c, [['abc']]))[0]).toMatchObject({ code: 'number_format' });
  });

  it('validates a checkbox column (TRUE / FALSE / empty only)', () => {
    const c = [col('完了', 'checkbox')];
    expect(validateTsv(doc(c, [['TRUE']]))).toEqual([]);
    expect(validateTsv(doc(c, [['FALSE']]))).toEqual([]);
    expect(validateTsv(doc(c, [['']]))).toEqual([]);
    expect(validateTsv(doc(c, [['yes']]))[0]).toMatchObject({ code: 'checkbox_value' });
    expect(validateTsv(doc(c, [['true']]))[0]).toMatchObject({ code: 'checkbox_value' });
  });

  it('validates a url column (http/https only)', () => {
    const c = [col('参照', 'url')];
    expect(validateTsv(doc(c, [['https://example.com/a']]))).toEqual([]);
    expect(validateTsv(doc(c, [['http://example.com']]))).toEqual([]);
    expect(validateTsv(doc(c, [['ftp://example.com']]))[0]).toMatchObject({ code: 'url_format' });
    expect(validateTsv(doc(c, [['not a url']]))[0]).toMatchObject({ code: 'url_format' });
  });

  it('flags rows with more cells than declared columns', () => {
    const d = doc([col('項目', 'text'), col('結果', 'text')], [['A', '〇', '余分']]);

    const issues = validateTsv(d);

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ row: 0, column: 2, code: 'extra_columns' });
  });

  it('allows rows with fewer cells than columns (trailing cells omitted)', () => {
    const d = doc([col('項目', 'text'), col('担当', 'text'), col('備考', 'text')], [['A']]);

    expect(validateTsv(d)).toEqual([]);
  });

  it('reports the correct row index across multiple data rows', () => {
    const d = doc(
      [col('実施日', 'date')],
      [['2026-06-22'], ['bad-date'], ['2026-06-24']],
    );

    const issues = validateTsv(d);

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ row: 1, column: 0, code: 'date_format' });
  });

  it('collects multiple independent issues in row-major order', () => {
    const d = doc(
      [col('結果', 'enum', { required: true, enumValues: ['〇'] }), col('件数', 'number')],
      [
        ['', 'abc'],
        ['〇', '5'],
      ],
    );

    const issues = validateTsv(d);

    expect(issues).toHaveLength(2);
    expect(issues[0]).toMatchObject({ row: 0, column: 0, code: 'required' });
    expect(issues[1]).toMatchObject({ row: 0, column: 1, code: 'number_format' });
  });
});
