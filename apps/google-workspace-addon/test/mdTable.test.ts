import { describe, expect, it } from 'vitest';

import { mdTableToValues, parseMdTable } from '../src/lib/mdTable.js';

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
