import { findRowsByCell, type IdentifiedTsv, type RowLookup } from '@md-business/schema-test-spec-tsv';

/**
 * 表の中で、列名と値から移動先の行を引く。
 *
 * ID 列は読み込み時に表から外して `rowIds` に移してあるので、列として引けない。
 * ID 列を指されたときだけ行 ID の並びから引き、列は先頭に置く。
 */
export function findJumpRows(doc: IdentifiedTsv, column: string, value: string): RowLookup {
  if (column.trim() === doc.idColumn) {
    const wanted = value.trim();
    const rows: number[] = [];
    doc.rowIds.forEach((rowId, i) => {
      if (rowId === wanted) rows.push(i);
    });
    return { column: 0, rows };
  }
  return findRowsByCell(doc, column, value);
}
