import { describe, expect, it } from 'vitest';
import { parseTsv, withRowIds } from '@md-business/schema-test-spec-tsv';
import { findJumpRows } from './gridJump';

const doc = withRowIds(
  parseTsv(
    ['#! md-business:test-spec-tsv/v1', '#@ rowid _id', 'No.\t項目\t_id', '1\ta\tr000000000001', '2\tb\tr000000000002'].join(
      '\n',
    ),
  ),
);

describe('findJumpRows', () => {
  it('ID 列は表から外れているので、行 ID の並びから引く', () => {
    expect(findJumpRows(doc, '_id', 'r000000000002')).toEqual({ column: 0, rows: [1] });
  });

  it('表から外れている行（控え・絞り込み）の ID は見つからない', () => {
    expect(findJumpRows(doc, '_id', 'r0000000000ff')).toEqual({ column: 0, rows: [] });
  });

  it('ほかの列は値で引く', () => {
    expect(findJumpRows(doc, '項目', 'b')).toEqual({ column: 1, rows: [1] });
    expect(findJumpRows(doc, '無い列', 'b')).toEqual({ column: -1, rows: [] });
  });
});
