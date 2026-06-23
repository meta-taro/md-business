import { describe, expect, it } from 'vitest';

import { mdTableToValues, parseMdTable, valuesToMdTable } from '../src/lib/mdTable.js';

describe('parseMdTable', () => {
  it('parses 3 columns + 2 rows', () => {
    const src = [
      '| 項目 | OK/NG | 備考 |',
      '|---|---|---|',
      '| ログイン成功 | OK | - |',
      '| ログイン失敗(空欄) | NG | エラーメッセージなし |',
    ].join('\n');
    const table = parseMdTable(src);
    expect(table).not.toBeNull();
    expect(table?.header).toEqual(['項目', 'OK/NG', '備考']);
    expect(table?.rows).toHaveLength(2);
    expect(table?.rows[0]).toEqual(['ログイン成功', 'OK', '-']);
    expect(table?.rows[1]).toEqual(['ログイン失敗(空欄)', 'NG', 'エラーメッセージなし']);
  });

  it('returns null for non-table input', () => {
    expect(parseMdTable('plain text')).toBeNull();
    expect(parseMdTable('')).toBeNull();
  });

  it('handles CRLF line endings', () => {
    const src = ['| a | b |', '|---|---|', '| 1 | 2 |'].join('\r\n');
    const table = parseMdTable(src);
    expect(table?.rows[0]).toEqual(['1', '2']);
  });

  it('rejects when separator row missing', () => {
    expect(parseMdTable('| a | b |\n| 1 | 2 |')).toBeNull();
  });

  it('accepts alignment markers in separator', () => {
    const src = ['| a | b | c |', '| :--- | :---: | ---: |', '| 1 | 2 | 3 |'].join('\n');
    const table = parseMdTable(src);
    expect(table?.header).toEqual(['a', 'b', 'c']);
    expect(table?.rows[0]).toEqual(['1', '2', '3']);
  });
});

describe('mdTableToValues', () => {
  it('flattens header + rows into a 2D string array', () => {
    const values = mdTableToValues({
      header: ['x', 'y'],
      rows: [
        ['1', '2'],
        ['3', '4'],
      ],
    });
    expect(values).toEqual([
      ['x', 'y'],
      ['1', '2'],
      ['3', '4'],
    ]);
  });
});

describe('valuesToMdTable', () => {
  it('renders header + body with pipe separators', () => {
    const md = valuesToMdTable([
      ['項目', 'OK/NG', '備考'],
      ['ログイン成功', 'OK', '-'],
      ['ログイン失敗(空欄)', 'NG', 'エラーなし'],
    ]);
    expect(md).toBe(
      [
        '| 項目 | OK/NG | 備考 |',
        '| --- | --- | --- |',
        '| ログイン成功 | OK | - |',
        '| ログイン失敗(空欄) | NG | エラーなし |',
      ].join('\n'),
    );
  });

  it('returns empty string for empty input', () => {
    expect(valuesToMdTable([])).toBe('');
  });

  it('handles header-only input (no body rows)', () => {
    const md = valuesToMdTable([['a', 'b', 'c']]);
    expect(md).toBe(['| a | b | c |', '| --- | --- | --- |'].join('\n'));
  });

  it('escapes pipe characters in cells', () => {
    const md = valuesToMdTable([
      ['key', 'value'],
      ['type', 'string | null'],
    ]);
    expect(md).toContain('| type | string \\| null |');
  });

  it('replaces newlines inside cells with spaces', () => {
    const md = valuesToMdTable([
      ['key', 'value'],
      ['note', 'line1\nline2'],
    ]);
    expect(md).toContain('| note | line1 line2 |');
  });

  it('normalizes null / undefined / number / boolean cells to strings', () => {
    const md = valuesToMdTable([
      ['k1', 'k2', 'k3', 'k4'],
      [null, undefined, 42, true],
    ]);
    expect(md.split('\n')[2]).toBe('|  |  | 42 | true |');
  });

  it('formats Date cells as YYYY-MM-DD (Apps Script は date セルを Date オブジェクトで返すため)', () => {
    // String(date) すると `Mon Jun 22 2026 00:00:00 GMT+0900 (日本標準時)` になる。
    // 検証シートでは ISO 短縮形 (YYYY-MM-DD) に正規化する。
    const md = valuesToMdTable([
      ['日付', '担当'],
      [new Date(2026, 5, 22), '田中'],
      [new Date(2026, 5, 23), '佐藤'],
    ]);
    const lines = md.split('\n');
    expect(lines[2]).toBe('| 2026-06-22 | 田中 |');
    expect(lines[3]).toBe('| 2026-06-23 | 佐藤 |');
  });

  it('renders invalid Date as empty string', () => {
    const md = valuesToMdTable([
      ['日付'],
      [new Date(NaN)],
    ]);
    expect(md.split('\n')[2]).toBe('|  |');
  });

  it('round-trips parseMdTable ↔ valuesToMdTable for simple tables', () => {
    const src = [
      '| 項目 | 状態 |',
      '| --- | --- |',
      '| A | OK |',
      '| B | NG |',
    ].join('\n');
    const parsed = parseMdTable(src);
    expect(parsed).not.toBeNull();
    const round = valuesToMdTable(mdTableToValues(parsed!));
    expect(round).toBe(src);
  });
});
