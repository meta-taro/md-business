import { describe, it, expect } from 'vitest';
import { diffSheets } from '../src/diff.js';
import { parseTsv } from '../src/parse.js';
import type { TsvDocument } from '../src/parse.js';

/**
 * 版間の差分。
 *
 * 提出様式では直した箇所を赤字にする慣習があり、いまは人が手で塗っている。
 * 行 ID があり、履歴が git にあるなら、**どこが変わったかは導き出せる**。
 * 人に「変えた行はここ」と書かせない。書かせると、書き忘れた行が無かったことになる。
 *
 * 最重要契約:
 * - **突き合わせは行 ID だけで行う**。行番号で当てると、1 行挿しただけで
 *   それ以降が全部「変わった」になり、赤字が全面に出て意味が消える。
 * - **並べ替えただけの行は差分にしない**。順番はグリッドの都合であって、中身の変更ではない。
 * - **ID を持たない版とは比べない**（`comparable: false`）。行番号へ落として
 *   それらしい差分を出すより、比べられないと言うほうが安全。嘘の赤字は直す先を誤らせる。
 * - **増えた列のセルは「変わったセル」に数えない**。列ごと新しいなら全行が変わったことに
 *   なり、その列だけが赤くなるべきという情報が消える。
 * - **消えた行は中身ごと返す**。新しい側のグリッドには置き場が無いので、
 *   呼ぶ側が別に見せるしかない。件数だけ返すと、何が消えたか確かめられない。
 */

/** 見出しと行から検証シートを組む。ID 列は末尾（既定名 `_id`）。 */
function sheet(columns: readonly string[], rows: readonly (readonly string[])[]): TsvDocument {
  const lines = [
    '#! md-business:test-spec-tsv/v1',
    '#@ rowid _id',
    columns.join('\t'),
    ...rows.map((cells) => cells.join('\t')),
  ];
  return parseTsv(lines.join('\n'));
}

/** 行 ID → 変わった列名の一覧（テストで見やすい形へ畳む）。 */
function changedNames(diff: ReturnType<typeof diffSheets>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [id, columns] of diff.changed) out[id] = [...columns].sort();
  return out;
}

const COLUMNS = ['No.:number', '項目', '結果', '_id'];

describe('diffSheets', () => {
  it('値が変わったセルだけを返す', () => {
    const before = sheet(COLUMNS, [
      ['1', 'ログインできる', '未実施', 'r000000000001'],
      ['2', 'ログアウトできる', '未実施', 'r000000000002'],
    ]);
    const after = sheet(COLUMNS, [
      ['1', 'ログインできる', 'OK', 'r000000000001'],
      ['2', 'ログアウトできる', '未実施', 'r000000000002'],
    ]);

    const diff = diffSheets(before, after);

    expect(diff.comparable).toBe(true);
    expect(changedNames(diff)).toEqual({ r000000000001: ['結果'] });
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
  });

  it('並べ替えただけの行は差分にしない', () => {
    const before = sheet(COLUMNS, [
      ['1', 'ログインできる', 'OK', 'r000000000001'],
      ['2', 'ログアウトできる', 'OK', 'r000000000002'],
    ]);
    const after = sheet(COLUMNS, [
      ['1', 'ログアウトできる', 'OK', 'r000000000002'],
      ['2', 'ログインできる', 'OK', 'r000000000001'],
    ]);

    const diff = diffSheets(before, after);

    // `No.` は採番結果を表示しているだけなので、入れ替われば当然変わる。
    // 中身（項目・結果）は動いていない。
    expect(changedNames(diff)).toEqual({
      r000000000001: ['No.'],
      r000000000002: ['No.'],
    });
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
  });

  it('新しい側にだけある行を、並び順のまま返す', () => {
    const before = sheet(COLUMNS, [['1', 'ログインできる', 'OK', 'r000000000001']]);
    const after = sheet(COLUMNS, [
      ['1', '前提を整える', '未実施', 'r000000000003'],
      ['2', 'ログインできる', 'OK', 'r000000000001'],
      ['3', 'ログアウトできる', '未実施', 'r000000000002'],
    ]);

    const diff = diffSheets(before, after);

    expect(diff.added).toEqual(['r000000000003', 'r000000000002']);
    // 増えた行のセルは「変わったセル」に数えない（行ごと新しい）。
    expect(changedNames(diff)).toEqual({ r000000000001: ['No.'] });
  });

  it('消えた行を中身ごと返す', () => {
    const before = sheet(COLUMNS, [
      ['1', 'ログインできる', 'OK', 'r000000000001'],
      ['2', '使わなくなった確認', '保留', 'r000000000002'],
    ]);
    const after = sheet(COLUMNS, [['1', 'ログインできる', 'OK', 'r000000000001']]);

    const diff = diffSheets(before, after);

    expect(diff.removed).toEqual([
      {
        id: 'r000000000002',
        cells: { 'No.': '2', 項目: '使わなくなった確認', 結果: '保留' },
      },
    ]);
    expect(diff.added).toEqual([]);
  });

  it('増えた列は列として返し、そのセルは変わったセルに数えない', () => {
    const before = sheet(['No.:number', '項目', '_id'], [['1', 'ログインできる', 'r000000000001']]);
    const after = sheet(COLUMNS, [['1', 'ログインできる', 'OK', 'r000000000001']]);

    const diff = diffSheets(before, after);

    expect(diff.addedColumns).toEqual(['結果']);
    expect(diff.removedColumns).toEqual([]);
    expect(changedNames(diff)).toEqual({});
  });

  it('消えた列を返す', () => {
    const before = sheet(COLUMNS, [['1', 'ログインできる', 'OK', 'r000000000001']]);
    const after = sheet(['No.:number', '項目', '_id'], [['1', 'ログインできる', 'r000000000001']]);

    const diff = diffSheets(before, after);

    expect(diff.removedColumns).toEqual(['結果']);
    expect(changedNames(diff)).toEqual({});
  });

  it('セルが足りない行でも落ちない', () => {
    const before = sheet(COLUMNS, [['1', 'ログインできる']]);
    const after = sheet(COLUMNS, [['1', 'ログインできる', '', '']]);

    // ID が無い行は採番されるので、突き合わせ相手がいない＝消えて増えた扱いになる。
    // ここで見たいのは「セル欠けが例外にならない」こと。
    expect(() => diffSheets(before, after)).not.toThrow();
  });

  it('型注記が付いた見出しは注記を外した名前で突き合わせる', () => {
    const before = sheet(
      ['No.:number', '結果:enum(OK|NG)', '_id'],
      [['1', 'OK', 'r000000000001']],
    );
    const after = sheet(
      ['No.:number', '結果:enum(OK|NG|保留)', '_id'],
      [['1', 'NG', 'r000000000001']],
    );

    const diff = diffSheets(before, after);

    // 選べる値が増えただけで列が入れ替わったことにはしない。
    expect(diff.addedColumns).toEqual([]);
    expect(diff.removedColumns).toEqual([]);
    expect(changedNames(diff)).toEqual({ r000000000001: ['結果'] });
  });

  it('古い側が行 ID を持たなければ比べない', () => {
    const before = parseTsv(
      ['#! md-business:test-spec-tsv/v1', 'No.:number\t項目', '1\tログインできる'].join('\n'),
    );
    const after = sheet(COLUMNS, [['1', 'ログインできる', 'OK', 'r000000000001']]);

    const diff = diffSheets(before, after);

    expect(diff.comparable).toBe(false);
    expect(diff.reason).toBe('古い版に行 ID がない');
    expect(changedNames(diff)).toEqual({});
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
  });

  it('新しい側が行 ID を持たなければ比べない', () => {
    const before = sheet(COLUMNS, [['1', 'ログインできる', 'OK', 'r000000000001']]);
    const after = parseTsv(
      ['#! md-business:test-spec-tsv/v1', 'No.:number\t項目', '1\tログインできる'].join('\n'),
    );

    const diff = diffSheets(before, after);

    expect(diff.comparable).toBe(false);
    expect(diff.reason).toBe('いまの版に行 ID がない');
  });

  it('同じ中身どうしは何も返さない', () => {
    const before = sheet(COLUMNS, [['1', 'ログインできる', 'OK', 'r000000000001']]);
    const after = sheet(COLUMNS, [['1', 'ログインできる', 'OK', 'r000000000001']]);

    const diff = diffSheets(before, after);

    expect(diff.comparable).toBe(true);
    expect(diff.changed.size).toBe(0);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
    expect(diff.addedColumns).toEqual([]);
    expect(diff.removedColumns).toEqual([]);
  });
});
