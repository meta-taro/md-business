import { describe, it, expect } from 'vitest';
import type { ParsedHeader, TsvDocument } from '@md-business/schema-test-spec-tsv';
import { widgetForColumn, gridWidgets, setCell } from './gridModel';

/**
 * TSV グリッドの純モデル（Issue 010・Block TSV-7）。
 *
 * Desktop の編集グリッドが束ねる純ロジック:
 * - `widgetForColumn` — 列型（+ UI ヒント）を入力ウィジェット種別へ写像。
 * - `gridWidgets` — ヘッダ列定義列全体をウィジェット列へ。
 * - `setCell` — セル編集を **不変** に反映（末尾省略行はパディング）。
 *
 * Svelte コンポーネント（次ブロック）はこのモデルを描画・binding するだけにし、
 * 決定ロジックはここで node 環境の vitest で検査する（DESIGN.md の純ロジック方針）。
 */

const col = (
  name: string,
  type: ParsedHeader['type'],
  extra: Partial<ParsedHeader> = {},
): ParsedHeader => ({ name, type, required: false, ...extra });

describe('widgetForColumn', () => {
  it('maps a text column to a single-line text input', () => {
    expect(widgetForColumn(col('項目', 'text'))).toEqual({ kind: 'text', required: false });
  });

  it('carries the required flag through', () => {
    expect(widgetForColumn(col('項目', 'text', { required: true }))).toEqual({
      kind: 'text',
      required: true,
    });
  });

  it('maps a multiline_text column to a textarea', () => {
    expect(widgetForColumn(col('手順', 'multiline_text'))).toEqual({
      kind: 'multiline',
      required: false,
    });
  });

  it('maps a plain enum column to a select (dropdown) with its choices', () => {
    expect(widgetForColumn(col('結果', 'enum', { enumValues: ['〇', '×', '保留'] }))).toEqual({
      kind: 'select',
      options: ['〇', '×', '保留'],
      required: false,
    });
  });

  it('maps an enum column with ui:radio to a radio group', () => {
    expect(
      widgetForColumn(col('判定', 'enum', { ui: 'radio', enumValues: ['A', 'B'] })),
    ).toEqual({ kind: 'radio', options: ['A', 'B'], required: false });
  });

  it('defaults enum choices to an empty list when none are declared', () => {
    expect(widgetForColumn(col('結果', 'enum'))).toEqual({
      kind: 'select',
      options: [],
      required: false,
    });
  });

  it('maps a date column to a date picker', () => {
    expect(widgetForColumn(col('実施日', 'date'))).toEqual({ kind: 'date', required: false });
  });

  it('maps a date column with ui:datetime to a datetime picker', () => {
    expect(widgetForColumn(col('実施', 'date', { ui: 'datetime' }))).toEqual({
      kind: 'datetime',
      required: false,
    });
  });

  it('maps a number column to a number input', () => {
    expect(widgetForColumn(col('件数', 'number'))).toEqual({ kind: 'number', required: false });
  });

  it('maps a checkbox column to a checkbox', () => {
    expect(widgetForColumn(col('完了', 'checkbox'))).toEqual({
      kind: 'checkbox',
      required: false,
    });
  });

  it('maps a url column to a url input', () => {
    expect(widgetForColumn(col('参照', 'url'))).toEqual({ kind: 'url', required: false });
  });
});

describe('gridWidgets', () => {
  it('derives a widget per column in order', () => {
    const columns = [
      col('項目', 'text'),
      col('結果', 'enum', { required: true, enumValues: ['〇', '×'] }),
      col('完了', 'checkbox'),
    ];

    expect(gridWidgets(columns)).toEqual([
      { kind: 'text', required: false },
      { kind: 'select', options: ['〇', '×'], required: true },
      { kind: 'checkbox', required: false },
    ]);
  });

  it('returns an empty list for no columns', () => {
    expect(gridWidgets([])).toEqual([]);
  });
});

describe('setCell', () => {
  const baseDoc = (rows: string[][]): TsvDocument => ({
    formatId: 'md-business:test-spec-tsv/v1',
    meta: {},
    directives: [],
    columns: [col('項目', 'text'), col('結果', 'text'), col('備考', 'text')],
    rows,
  });

  it('replaces an existing cell without mutating the input', () => {
    const doc = baseDoc([['A', '〇', 'メモ']]);

    const next = setCell(doc, 0, 1, '×');

    expect(next.rows).toEqual([['A', '×', 'メモ']]);
    // 入力は不変。
    expect(doc.rows).toEqual([['A', '〇', 'メモ']]);
    expect(next).not.toBe(doc);
    expect(next.rows[0]).not.toBe(doc.rows[0]);
  });

  it('pads a trailing-omitted row up to the edited column', () => {
    const doc = baseDoc([['A']]); // 結果・備考は末尾省略

    const next = setCell(doc, 0, 2, '追記');

    expect(next.rows).toEqual([['A', '', '追記']]);
  });

  it('edits only the target row', () => {
    const doc = baseDoc([
      ['A', '〇', ''],
      ['B', '×', ''],
    ]);

    const next = setCell(doc, 1, 0, 'B2');

    expect(next.rows).toEqual([
      ['A', '〇', ''],
      ['B2', '×', ''],
    ]);
    expect(next.rows[0]).toBe(doc.rows[0]); // 触れていない行は同一参照
  });

  it('preserves formatId / meta / directives / columns', () => {
    const doc = baseDoc([['A', '〇', '']]);

    const next = setCell(doc, 0, 0, 'A2');

    expect(next.formatId).toBe(doc.formatId);
    expect(next.meta).toBe(doc.meta);
    expect(next.directives).toBe(doc.directives);
    expect(next.columns).toBe(doc.columns);
  });
});
