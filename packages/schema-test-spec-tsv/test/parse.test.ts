import { describe, it, expect } from 'vitest';
import { parseTsv } from '../src/parse.js';

/**
 * パーサ本体：カスタム TSV テキスト全体を `{ formatId, meta, directives, columns, rows }`
 * へ組み上げる（Issue 010・Block TSV-4）。3 部品 escape / header / classify を統合する。
 *
 * - 物理行を `classifyLine` で判別し、種類ごとに処理を振り分ける。
 * - 最初の `data` 行＝型付きヘッダ（`parseTypedHeader`）、以降＝データ行（tab 分割 + `unescapeCell`）。
 * - セル内改行は `\n` エスケープで 1 レコード 1 物理行に保たれている前提。
 */
describe('parseTsv', () => {
  it('parses a full document (magic + meta + directive + header + rows)', () => {
    const text = [
      '#! md-business:test-spec-tsv/v1',
      '#  文書番号: TEST-2026-0002',
      '#  タイトル: 受発注ワークフロー 検証シート',
      '#@ style 結果 〇=#e6f4ea ×=#fce8e6',
      '項目\t手順:multiline\t結果:enum(〇|×)',
      '新規受注登録\t顧客を入力\t〇',
    ].join('\n');

    const doc = parseTsv(text);

    expect(doc.formatId).toBe('md-business:test-spec-tsv/v1');
    expect(doc.meta).toEqual({
      文書番号: 'TEST-2026-0002',
      タイトル: '受発注ワークフロー 検証シート',
    });
    expect(doc.directives).toEqual(['style 結果 〇=#e6f4ea ×=#fce8e6']);
    expect(doc.columns).toEqual([
      { name: '項目', type: 'text', required: false },
      { name: '手順', type: 'multiline_text', required: false },
      { name: '結果', type: 'enum', required: false, enumValues: ['〇', '×'] },
    ]);
    expect(doc.rows).toEqual([['新規受注登録', '顧客を入力', '〇']]);
  });

  it('unescapes cell newlines in data rows', () => {
    const text = [
      '項目\t期待結果:multiline',
      '在庫不足\t「在庫不足: 残 5 個」\\nエラーで確定不可',
    ].join('\n');

    const doc = parseTsv(text);

    expect(doc.rows).toEqual([
      ['在庫不足', '「在庫不足: 残 5 個」\nエラーで確定不可'],
    ]);
  });

  it('skips blank lines', () => {
    const text = ['項目\t結果', '', 'A\t〇', '   ', 'B\t×'].join('\n');

    const doc = parseTsv(text);

    expect(doc.rows).toEqual([
      ['A', '〇'],
      ['B', '×'],
    ]);
  });

  it('preserves empty trailing cells (空セルは空のまま)', () => {
    const text = ['項目\t担当\t結果', '軽減税率混在\t\t未実施'].join('\n');

    const doc = parseTsv(text);

    expect(doc.rows).toEqual([['軽減税率混在', '', '未実施']]);
  });

  it('handles CRLF line endings', () => {
    const text = '項目\t結果\r\nA\t〇\r\n';

    const doc = parseTsv(text);

    expect(doc.columns).toEqual([
      { name: '項目', type: 'text', required: false },
      { name: '結果', type: 'text', required: false },
    ]);
    expect(doc.rows).toEqual([['A', '〇']]);
  });

  it('splits meta on the first colon only (value may contain colons)', () => {
    const text = ['# タイトル: 受発注: 検証シート', '項目', 'A'].join('\n');

    const doc = parseTsv(text);

    expect(doc.meta).toEqual({ タイトル: '受発注: 検証シート' });
  });

  it('ignores a meta line without a colon (free comment)', () => {
    const text = ['# これはただのコメント', '項目', 'A'].join('\n');

    const doc = parseTsv(text);

    expect(doc.meta).toEqual({});
  });

  it('yields an empty formatId when there is no magic line', () => {
    const text = ['項目\t結果', 'A\t〇'].join('\n');

    const doc = parseTsv(text);

    expect(doc.formatId).toBe('');
    expect(doc.columns.length).toBe(2);
  });

  it('returns an empty document for empty text', () => {
    const doc = parseTsv('');

    expect(doc).toEqual({
      formatId: '',
      meta: {},
      directives: [],
      columns: [],
      rows: [],
    });
  });

  it('returns header columns but no rows when only a header is present', () => {
    const doc = parseTsv('項目\t結果');

    expect(doc.columns.length).toBe(2);
    expect(doc.rows).toEqual([]);
  });

  it('collects multiple directive lines in order', () => {
    const text = [
      '#@ style 結果 〇=#e6f4ea',
      '#@ freeze 1',
      '項目\t結果',
      'A\t〇',
    ].join('\n');

    const doc = parseTsv(text);

    expect(doc.directives).toEqual(['style 結果 〇=#e6f4ea', 'freeze 1']);
  });

  it('applies later meta value when the same key repeats', () => {
    const text = ['# 版: 0.1.0', '# 版: 0.2.0', '項目', 'A'].join('\n');

    const doc = parseTsv(text);

    expect(doc.meta).toEqual({ 版: '0.2.0' });
  });
});
