import { describe, it, expect } from 'vitest';
import { reorderRows, sortedRowIds } from './gridSort';
import { parseTsv, withRowIds, ROW_ID_COLUMN, type IdentifiedTsv } from '@md-business/schema-test-spec-tsv';

/** 1 列目を値、行 ID を r000000000000, r000000000001, … として表を組む。 */
function sheet(values: string[]): IdentifiedTsv {
  return withRowIds(
    parseTsv(
      [
        '#! md-business:test-spec-tsv/v1',
        `#@ rowid ${ROW_ID_COLUMN}`,
        `値\t${ROW_ID_COLUMN}`,
        ...values.map((value, i) => `${value}\tr${String(i).padStart(12, '0')}`),
      ].join('\n'),
    ),
  );
}

/** 並んだ行 ID を元の値へ引き直す（読みやすさのため）。 */
function valuesOf(doc: IdentifiedTsv, ids: readonly string[]): string[] {
  return ids.map((id) => doc.rows[doc.rowIds.indexOf(id)]?.[0] ?? '?');
}

describe('sortedRowIds — 数値', () => {
  it('文字としてでなく数として並べる', () => {
    const doc = sheet(['10', '9', '100', '1,000']);
    expect(valuesOf(doc, sortedRowIds(doc, { col: 0, dir: 'asc', kind: 'number' }))).toEqual([
      '9',
      '10',
      '100',
      '1,000',
    ]);
  });

  it('降順でも空欄と数でない値は末尾に置く', () => {
    const doc = sheet(['', '3', 'abc', '5']);
    expect(valuesOf(doc, sortedRowIds(doc, { col: 0, dir: 'desc', kind: 'number' }))).toEqual([
      '5',
      '3',
      'abc',
      '',
    ]);
  });
});

describe('sortedRowIds — 日付', () => {
  it('ゼロ埋めの無い書き方も日付として並べる', () => {
    const doc = sheet(['2026/10/1', '2026-09-30', '2026/9/5']);
    expect(valuesOf(doc, sortedRowIds(doc, { col: 0, dir: 'asc', kind: 'date' }))).toEqual([
      '2026/9/5',
      '2026-09-30',
      '2026/10/1',
    ]);
  });
});

describe('sortedRowIds — 選択肢', () => {
  it('選択肢の並び順で並べ、選択肢に無い値はその後、空欄は最後', () => {
    const doc = sheet(['OK', '', 'NG', '要確認', '未実施']);
    const spec = { col: 0, dir: 'asc', kind: 'enum', options: ['未実施', 'OK', 'NG'] } as const;
    expect(valuesOf(doc, sortedRowIds(doc, spec))).toEqual(['未実施', 'OK', 'NG', '要確認', '']);
  });
});

describe('sortedRowIds — 文字', () => {
  it('同じ値の行は元の並びを保つ', () => {
    const doc = sheet(['b', 'a', 'b', 'a']);
    const ids = sortedRowIds(doc, { col: 0, dir: 'asc', kind: 'text' });
    expect(ids).toEqual([doc.rowIds[1], doc.rowIds[3], doc.rowIds[0], doc.rowIds[2]]);
  });

  it('降順でも同じ値の行は元の並びを保つ', () => {
    const doc = sheet(['a', 'b', 'a']);
    const ids = sortedRowIds(doc, { col: 0, dir: 'desc', kind: 'text' });
    expect(ids).toEqual([doc.rowIds[1], doc.rowIds[0], doc.rowIds[2]]);
  });

  it('数字を含む文字は数の大きさで並べる', () => {
    const doc = sheet(['項目10', '項目2']);
    expect(valuesOf(doc, sortedRowIds(doc, { col: 0, dir: 'asc', kind: 'text' }))).toEqual([
      '項目2',
      '項目10',
    ]);
  });
});

describe('reorderRows — 行 ID の並びに合わせる', () => {
  it('並びにある行をその順に並べる', () => {
    const doc = sheet(['a', 'b', 'c']);
    const [a, b, c] = doc.rowIds as [string, string, string];
    const next = reorderRows(doc, [c, a, b]);
    expect(next.rows.map((row) => row[0])).toEqual(['c', 'a', 'b']);
    expect(next.rowIds).toEqual([c, a, b]);
  });

  it('並びに無い行（後から足した行）は、直前にあった行の後ろに付いていく', () => {
    const doc = sheet(['a', 'new', 'b', 'c']);
    const [a, added, b, c] = doc.rowIds as [string, string, string, string];
    expect(reorderRows(doc, [c, b, a]).rowIds).toEqual([c, b, a, added]);
  });

  it('先頭に足した行は先頭に残す', () => {
    const doc = sheet(['new', 'a', 'b']);
    const [added, a, b] = doc.rowIds as [string, string, string];
    expect(reorderRows(doc, [b, a]).rowIds).toEqual([added, b, a]);
  });

  it('並びにあって表に無い行（消した行）は飛ばす', () => {
    const doc = sheet(['a', 'c']);
    const [a, c] = doc.rowIds as [string, string];
    expect(reorderRows(doc, [c, 'rgone00000000', a]).rowIds).toEqual([c, a]);
  });

  it('並べ替えて戻すと元の並びに戻る', () => {
    const doc = sheet(['a', 'b', 'c']);
    const fileOrder = [...doc.rowIds];
    const view = reorderRows(doc, sortedRowIds(doc, { col: 0, dir: 'desc', kind: 'text' }));
    expect(view.rows.map((row) => row[0])).toEqual(['c', 'b', 'a']);
    expect(reorderRows(view, fileOrder).rowIds).toEqual(fileOrder);
  });
});
