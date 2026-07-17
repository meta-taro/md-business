import { describe, it, expect } from 'vitest';
import { serializeTsv, serializeHeader } from '../src/serialize.js';
import { parseTsv } from '../src/parse.js';
import type { TsvDocument } from '../src/parse.js';
import type { ParsedHeader } from '../src/types.js';

/**
 * シリアライザ：`TsvDocument` を カスタム TSV テキストへ書き戻す純関数
 * （Issue 010・Block TSV-6）。`parseTsv` の逆変換。
 *
 * 最重要契約:
 * - **1 レコード = 1 物理行**。データセルの改行・タブは `escapeCell` で畳む（git diff クリーン維持）。
 * - **parse ⇄ serialize round-trip**。正規化済みドキュメントは `parseTsv(serializeTsv(doc))` で復元できる。
 */

/** 正規化済みドキュメントを組み立てるヘルパ。 */
function makeDoc(overrides: Partial<TsvDocument>): TsvDocument {
  return { formatId: '', meta: {}, directives: [], columns: [], rows: [], ...overrides };
}

/** 単一列を doc に載せて round-trip し、復元された columns を返す。 */
function roundTripColumns(columns: ParsedHeader[]): ParsedHeader[] {
  return parseTsv(serializeTsv(makeDoc({ columns }))).columns;
}

describe('serializeTsv', () => {
  it('serializes a full document to the expected text', () => {
    const doc = makeDoc({
      formatId: 'md-business:test-spec-tsv/v1',
      meta: { 文書番号: 'TEST-2026-0002', タイトル: '受発注 検証シート' },
      directives: ['style 結果 〇=#e6f4ea ×=#fce8e6'],
      columns: [
        { name: '項目', type: 'text', required: false },
        { name: '手順', type: 'multiline_text', required: false },
        { name: '結果', type: 'enum', required: false, enumValues: ['〇', '×'] },
        { name: '実施日', type: 'date', required: false },
      ],
      rows: [['新規受注', '顧客を入力\n確定', '〇', '2026-06-22']],
    });

    const expected = [
      '#! md-business:test-spec-tsv/v1',
      '# 文書番号: TEST-2026-0002',
      '# タイトル: 受発注 検証シート',
      '#@ style 結果 〇=#e6f4ea ×=#fce8e6',
      ['項目', '手順:multiline', '結果:enum(〇|×)', '実施日:date'].join('\t'),
      ['新規受注', '顧客を入力\\n確定', '〇', '2026-06-22'].join('\t'),
    ].join('\n');

    expect(serializeTsv(doc)).toBe(expected);
  });

  it('omits the magic line when formatId is empty', () => {
    const text = serializeTsv(makeDoc({ columns: [{ name: '項目', type: 'text', required: false }] }));

    expect(text.startsWith('#!')).toBe(false);
    expect(text).toBe('項目');
  });

  it('returns an empty string for an empty document', () => {
    expect(serializeTsv(makeDoc({}))).toBe('');
  });

  it('keeps one record on one physical line (escapes cell newline / tab / backslash)', () => {
    const doc = makeDoc({
      columns: [{ name: 'メモ', type: 'multiline_text', required: false }],
      rows: [['1行目\n2行目\tタブ\\バックスラッシュ']],
    });

    const text = serializeTsv(doc);

    // ヘッダ 1 行 + データ 1 行 = 物理行 2 行（セル内改行で行が割れない）。
    expect(text.split('\n')).toHaveLength(2);
    const dataLine = text.split('\n')[1] as string;
    expect(dataLine).toBe('1行目\\n2行目\\tタブ\\\\バックスラッシュ');
  });
});

describe('serialize ⇄ parse round-trip', () => {
  it('restores a full document', () => {
    const doc = makeDoc({
      formatId: 'md-business:test-spec-tsv/v1',
      meta: { 版: '0.1.0', 作成者: '田中' },
      directives: ['style 結果 〇=#e6f4ea', 'freeze 1'],
      columns: [
        { name: '項目', type: 'text', required: false },
        { name: '結果', type: 'enum', required: true, enumValues: ['〇', '×', '保留'] },
      ],
      rows: [
        ['新規受注', '〇'],
        ['在庫不足\n再試行', '×'],
      ],
    });

    expect(parseTsv(serializeTsv(doc))).toEqual(doc);
  });

  it('restores every column type', () => {
    const columns: ParsedHeader[] = [
      { name: '項目', type: 'text', required: false },
      { name: '必須', type: 'text', required: true },
      { name: '手順', type: 'multiline_text', required: false },
      { name: '結果', type: 'enum', required: false, enumValues: ['〇', '×'] },
      { name: '判定', type: 'enum', required: false, ui: 'radio', enumValues: ['A', 'B'] },
      { name: '日付', type: 'date', required: false },
      { name: '実施', type: 'date', required: false, ui: 'datetime' },
      { name: '件数', type: 'number', required: false },
      { name: '完了', type: 'checkbox', required: false },
      { name: '参照', type: 'url', required: false },
    ];

    expect(roundTripColumns(columns)).toEqual(columns);
  });

  it('restores an enum column that declares no choices', () => {
    const columns: ParsedHeader[] = [{ name: '結果', type: 'enum', required: false, enumValues: [] }];

    expect(roundTripColumns(columns)).toEqual(columns);
  });

  it('restores a header-only document (no rows)', () => {
    const doc = makeDoc({
      columns: [
        { name: '項目', type: 'text', required: false },
        { name: '担当', type: 'text', required: false },
      ],
    });

    expect(parseTsv(serializeTsv(doc))).toEqual(doc);
  });

  it('restores empty document via empty text', () => {
    const doc = makeDoc({});

    expect(parseTsv(serializeTsv(doc))).toEqual(doc);
  });

  it('restores data cells containing tab and newline', () => {
    const doc = makeDoc({
      columns: [{ name: 'メモ', type: 'multiline_text', required: false }],
      rows: [['タブ\tと改行\nを含む']],
    });

    expect(parseTsv(serializeTsv(doc))).toEqual(doc);
  });
});

describe('serializeHeader', () => {
  it('emits a bare name for a text column', () => {
    expect(serializeHeader({ name: '項目', type: 'text', required: false })).toBe('項目');
  });

  it('appends the required marker', () => {
    expect(serializeHeader({ name: '結果', type: 'text', required: true })).toBe('結果!');
  });

  it('renders enum choices with the required marker last', () => {
    expect(
      serializeHeader({ name: '結果', type: 'enum', required: true, enumValues: ['〇', '×'] }),
    ).toBe('結果:enum(〇|×)!');
  });

  it('renders an enum column with no enumValues field as empty choices', () => {
    expect(serializeHeader({ name: '結果', type: 'enum', required: false })).toBe('結果:enum()');
  });

  it('maps ui hints back to their keywords (radio / datetime)', () => {
    expect(
      serializeHeader({ name: '判定', type: 'enum', required: false, ui: 'radio', enumValues: ['A'] }),
    ).toBe('判定:radio(A)');
    expect(serializeHeader({ name: '実施', type: 'date', required: false, ui: 'datetime' })).toBe(
      '実施:datetime',
    );
  });
});
