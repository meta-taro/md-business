import { describe, it, expect } from 'vitest';
import { parseTsv, type TsvDocument } from '@md-business/schema-test-spec-tsv';
import { changedRowPositions, checkSheetReview } from './reviewCheck';
import { cellKey } from './sheetCompare';

/**
 * 指摘の往復を、指し先のファイルを読んで裏取りする（グリッドへ渡す形まで）。
 *
 * 判定そのものは schema 側の `checkReview`。ここが引き受けるのは
 * **どの版と比べるか・指し先をどう読むか**だけ。
 *
 * - 指し先は「いまの中身」と「基準版」の 2 つを読む。片方でも欠ければ裏取りしない
 * - 裏取りできないものを赤くしない。赤が普通になると本物の指摘が埋もれる
 * - 同じファイルを何行が指しても、読み取りは 1 回で足りる
 */

const TAB = String.fromCharCode(9);

/** 指摘の一覧。`対象` に指し先、`状態` に往復の状態を書く。 */
function reviewSheet(rows: readonly (readonly string[])[], directive = '#@ review state=状態 target=対象'): TsvDocument {
  return parseTsv(
    [
      '#! md-business:test-spec-tsv/v1',
      directive,
      ['指摘', '対象', '状態'].join(TAB),
      ...rows.map((cells) => cells.join(TAB)),
    ].join('\n'),
  );
}

/** 指し先の検証シート（行 ID 付き）。 */
function caseSheet(rows: readonly (readonly string[])[]): string {
  return [
    '#! md-business:test-spec-tsv/v1',
    '#@ rowid _id',
    ['No.:number', '項目', '_id'].join(TAB),
    ...rows.map((cells) => cells.join(TAB)),
  ].join('\n');
}

/** 行 ID を持たない指し先（＝基準版と突き合わせられない）。 */
function plainSheet(rows: readonly (readonly string[])[]): string {
  return [
    '#! md-business:test-spec-tsv/v1',
    ['No.:number', '項目'].join(TAB),
    ...rows.map((cells) => cells.join(TAB)),
  ].join('\n');
}

/** 1 ファイルだけ返す読み取り。 */
function only(path: string, source: string) {
  return async (asked: string) => (asked === path ? source : null);
}

const ID1 = 'r000000000001';

describe('checkSheetReview', () => {
  it('反映済みの指摘が指した行が基準版から変わっていれば、何も言わない', async () => {
    const doc = reviewSheet([['文言を直す', 'ケース.tsv#No.=1', '反映済み']]);
    const now = caseSheet([['1', '直したあとの項目', ID1]]);
    const was = caseSheet([['1', '直す前の項目', ID1]]);

    const issues = await checkSheetReview({
      self: { doc, changedRows: null },
      activePath: 'docs/指摘.tsv',
      read: only('docs/ケース.tsv', now),
      readBaseline: only('docs/ケース.tsv', was),
    });

    expect(issues).toEqual([]);
  });

  it('反映済みなのに指した行が変わっていなければ止める', async () => {
    const doc = reviewSheet([['文言を直す', 'ケース.tsv#No.=1', '反映済み']]);
    const same = caseSheet([['1', '直っていない項目', ID1]]);

    const issues = await checkSheetReview({
      self: { doc, changedRows: null },
      activePath: 'docs/指摘.tsv',
      read: only('docs/ケース.tsv', same),
      readBaseline: only('docs/ケース.tsv', same),
    });

    expect(issues.map((issue) => issue.code)).toEqual(['review_not_applied']);
    expect(issues[0]?.row).toBe(0);
  });

  it('同じシートの中を指した行は、渡された「変わった行」で判定する', async () => {
    const doc = reviewSheet([['文言を直す', '#指摘=文言を直す', '反映済み']]);
    const read = async () => null;

    const untouched = await checkSheetReview({
      self: { doc, changedRows: new Set() },
      activePath: 'docs/指摘.tsv',
      read,
      readBaseline: null,
    });
    expect(untouched.map((issue) => issue.code)).toEqual(['review_not_applied']);

    const touched = await checkSheetReview({
      self: { doc, changedRows: new Set([0]) },
      activePath: 'docs/指摘.tsv',
      read,
      readBaseline: null,
    });
    expect(touched).toEqual([]);
  });

  it('基準版を読む口が無ければ、裏取りしないで通す', async () => {
    const doc = reviewSheet([['文言を直す', 'ケース.tsv#No.=1', '反映済み']]);
    const now = caseSheet([['1', '直っていない項目', ID1]]);

    const issues = await checkSheetReview({
      self: { doc, changedRows: null },
      activePath: 'docs/指摘.tsv',
      read: only('docs/ケース.tsv', now),
      readBaseline: null,
    });

    expect(issues).toEqual([]);
  });

  it('指し先が行 ID を持たなければ、行番号へ落とさず裏取りしない', async () => {
    const doc = reviewSheet([['文言を直す', 'ケース.tsv#No.=1', '反映済み']]);
    const now = plainSheet([['1', '直っていない項目']]);

    const issues = await checkSheetReview({
      self: { doc, changedRows: null },
      activePath: 'docs/指摘.tsv',
      read: only('docs/ケース.tsv', now),
      readBaseline: only('docs/ケース.tsv', now),
    });

    expect(issues).toEqual([]);
  });

  it('基準版にそのファイルが無ければ、裏取りしないで通す', async () => {
    const doc = reviewSheet([['文言を直す', 'ケース.tsv#No.=1', '反映済み']]);
    const now = caseSheet([['1', '足したばかりの項目', ID1]]);

    const issues = await checkSheetReview({
      self: { doc, changedRows: null },
      activePath: 'docs/指摘.tsv',
      read: only('docs/ケース.tsv', now),
      readBaseline: async () => null,
    });

    expect(issues).toEqual([]);
  });

  it('指し先を読めなければ、止めずに警告で残す', async () => {
    const doc = reviewSheet([['文言を直す', 'ケース.tsv#No.=1', '反映済み']]);

    const issues = await checkSheetReview({
      self: { doc, changedRows: null },
      activePath: 'docs/指摘.tsv',
      read: async () => null,
      readBaseline: async () => null,
    });

    expect(issues.map((issue) => issue.code)).toEqual(['review_target_file_missing']);
    expect(issues[0]?.severity).toBe('warning');
  });

  it('同じファイルを何行が指しても、読み取りは 1 回で足りる', async () => {
    const doc = reviewSheet([
      ['文言を直す', 'ケース.tsv#No.=1', '反映済み'],
      ['順番を直す', 'ケース.tsv#No.=2', '反映済み'],
    ]);
    const now = caseSheet([
      ['1', '直したあとの項目', ID1],
      ['2', '直したあとの項目', 'r000000000002'],
    ]);
    let reads = 0;
    const read = async (asked: string) => {
      reads += 1;
      return asked === 'docs/ケース.tsv' ? now : null;
    };

    await checkSheetReview({
      self: { doc, changedRows: null },
      activePath: 'docs/指摘.tsv',
      read,
      readBaseline: null,
    });

    expect(reads).toBe(1);
  });

  it('宣言が無ければ、指し先を読みにいかない', async () => {
    const doc = reviewSheet([['文言を直す', 'ケース.tsv#No.=1', '反映済み']], '#@ rowid _id');
    let reads = 0;

    const issues = await checkSheetReview({
      self: { doc, changedRows: null },
      activePath: 'docs/指摘.tsv',
      read: async () => {
        reads += 1;
        return null;
      },
      readBaseline: null,
    });

    expect(issues).toEqual([]);
    expect(reads).toBe(0);
  });

  it('シートを開いていなくても、同じシートの中を指した行は判定できる', async () => {
    const doc = reviewSheet([['文言を直す', '#指摘=文言を直す', '反映済み']]);

    const issues = await checkSheetReview({
      self: { doc, changedRows: new Set() },
      activePath: null,
      read: async () => null,
      readBaseline: null,
    });

    expect(issues.map((issue) => issue.code)).toEqual(['review_not_applied']);
  });
});

describe('changedRowPositions', () => {
  const ROW_IDS = [ID1, 'r000000000002', 'r000000000003'];

  it('変わったセル・増えた行を、いまの並びでの行の位置へ畳む', () => {
    const positions = changedRowPositions(
      {
        issue: null,
        changed: new Set([cellKey('r000000000003', '項目')]),
        added: new Set([ID1]),
        addedColumns: new Set(),
        removed: [],
      },
      ROW_IDS,
    );

    expect([...(positions ?? [])]).toEqual([0, 2]);
  });

  it('比べていないときは、変わっていないと区別できる形で返す', () => {
    expect(changedRowPositions(null, ROW_IDS)).toBeNull();
    expect(
      changedRowPositions(
        {
          issue: 'no-row-id',
          changed: new Set(),
          added: new Set(),
          addedColumns: new Set(),
          removed: [],
        },
        ROW_IDS,
      ),
    ).toBeNull();
  });

  it('比べたうえで 1 行も変わっていなければ、空で返す', () => {
    const positions = changedRowPositions(
      { issue: null, changed: new Set(), added: new Set(), addedColumns: new Set(), removed: [] },
      ROW_IDS,
    );

    expect(positions).not.toBeNull();
    expect(positions?.size).toBe(0);
  });
});
