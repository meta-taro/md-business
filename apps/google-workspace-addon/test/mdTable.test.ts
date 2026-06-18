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
