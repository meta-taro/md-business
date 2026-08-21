import { describe, it, expect } from 'vitest';
import { checkReview, readReviewColumns } from '../src/review.js';
import type { ReviewTarget } from '../src/review.js';
import { parseTsv } from '../src/parse.js';
import type { TsvDocument } from '../src/parse.js';

/**
 * 指摘の往復（`#@ review`）。
 *
 * この機能が要る理由は 1 つの事故に尽きる。**対応案を出しただけの指摘を「反映済み」と
 * 記録してしまい、現物が直らないまま返信だけが先に出た**。直す作業と記録する作業が
 * 別々の手で行われる以上、ずれは必ず起きる。運用ルールで守らせず、機械に止めさせる。
 *
 * 最重要契約:
 * - **「反映済み」は、指した行が基準版から実際に変わっていることを要求する**。
 *   変わっていなければ間違い（`review_not_applied`）。ここが本題。
 * - **「クローズ」には要求しない**。「対応しない」と決めて閉じる指摘は実在する。
 *   要求すると、その行が永久に赤いまま残る。
 * - **基準版と比べられないときは裏取りをしない**。判定できないものを赤くすると、
 *   赤いのが普通になって本物が埋もれる。
 * - **行まで指していない対象は「裏取りできない」と言う**（警告）。黙って通すと
 *   確かめたうえで通ったのと見分けが付かない。
 */

const TAB = String.fromCharCode(9);

/** 指摘の一覧を組む。列は `指摘 / 対象 / 状態`。 */
function reviewSheet(
  rows: readonly (readonly string[])[],
  directive = '#@ review state=状態 target=対象',
): TsvDocument {
  return parseTsv(
    [
      '#! md-business:test-spec-tsv/v1',
      directive,
      ['指摘', '対象', '状態'].join(TAB),
      ...rows.map((cells) => cells.join(TAB)),
    ].join('\n'),
  );
}

/** 指し先のケース表を組む。列は `No. / 項目 / 結果`。 */
function caseSheet(rows: readonly (readonly string[])[]): TsvDocument {
  return parseTsv(
    [
      '#! md-business:test-spec-tsv/v1',
      ['No.:number', '項目', '結果'].join(TAB),
      ...rows.map((cells) => cells.join(TAB)),
    ].join('\n'),
  );
}

/** 1 ファイルだけを返す引き当て。それ以外は読めなかった扱い。 */
function only(path: string, target: ReviewTarget | null) {
  return (asked: string | null): ReviewTarget | null => (asked === path ? target : null);
}

const CASES = caseSheet([
  ['1', 'ログインできる', 'OK'],
  ['2', 'ログアウトできる', '未実施'],
]);

const COLUMNS = { stateColumn: 2, targetColumn: 1 };

describe('readReviewColumns', () => {
  it('宣言から状態列と対象列を読む', () => {
    const doc = reviewSheet([]);

    expect(
      readReviewColumns(
        doc.directives,
        doc.columns.map((column) => column.name),
      ),
    ).toEqual(COLUMNS);
  });

  it('列名に空白があっても読む', () => {
    const doc = parseTsv(
      [
        '#! md-business:test-spec-tsv/v1',
        '#@ review state=対応 状態 target=対象 セル',
        ['指摘', '対象 セル', '対応 状態'].join(TAB),
      ].join('\n'),
    );

    expect(
      readReviewColumns(
        doc.directives,
        doc.columns.map((column) => column.name),
      ),
    ).toEqual(COLUMNS);
  });

  it('宣言が無ければ null', () => {
    const doc = reviewSheet([], '#@ hidden r000000000001');

    expect(
      readReviewColumns(
        doc.directives,
        doc.columns.map((column) => column.name),
      ),
    ).toBeNull();
  });

  it('列定義に無い列を指した宣言は捨てる', () => {
    const doc = reviewSheet([], '#@ review state=進捗 target=対象');

    expect(
      readReviewColumns(
        doc.directives,
        doc.columns.map((column) => column.name),
      ),
    ).toBeNull();
  });

  it('状態と対象に同じ列を指した宣言は捨てる', () => {
    // 同じ列だと、状態を書いた瞬間に対象が消える。宣言として成り立たない。
    const doc = reviewSheet([], '#@ review state=対象 target=対象');

    expect(
      readReviewColumns(
        doc.directives,
        doc.columns.map((column) => column.name),
      ),
    ).toBeNull();
  });

  it('宣言が 2 本あれば後勝ち', () => {
    const doc = parseTsv(
      [
        '#! md-business:test-spec-tsv/v1',
        '#@ review state=状態 target=指摘',
        '#@ review state=状態 target=対象',
        ['指摘', '対象', '状態'].join(TAB),
      ].join('\n'),
    );

    expect(
      readReviewColumns(
        doc.directives,
        doc.columns.map((column) => column.name),
      ),
    ).toEqual(COLUMNS);
  });

  it('順序を入れ替えた宣言は捨てる', () => {
    // 書き方を 1 つに固定する。2 通り認めると、片方だけを読む実装が後から生える。
    const doc = reviewSheet([], '#@ review target=対象 state=状態');

    expect(
      readReviewColumns(
        doc.directives,
        doc.columns.map((column) => column.name),
      ),
    ).toBeNull();
  });
});

describe('checkReview', () => {
  it('反映済みなのに指した行が変わっていなければ止める', () => {
    const doc = reviewSheet([['文言を直す', 'ケース.tsv#No.=1', '反映済み']]);
    const target: ReviewTarget = { doc: CASES, changedRows: new Set() };

    const issues = checkReview(doc, COLUMNS, only('ケース.tsv', target));

    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe('review_not_applied');
    expect(issues[0]?.severity).toBe('error');
    // 間違っているのは状態の側（現物より記録が先に進んでいる）。
    expect(issues[0]?.row).toBe(0);
    expect(issues[0]?.column).toBe(2);
  });

  it('反映済みで指した行が変わっていれば何も言わない', () => {
    const doc = reviewSheet([['文言を直す', 'ケース.tsv#No.=1', '反映済み']]);
    const target: ReviewTarget = { doc: CASES, changedRows: new Set([0]) };

    expect(checkReview(doc, COLUMNS, only('ケース.tsv', target))).toEqual([]);
  });

  it('基準版と比べられないときは裏取りをしない', () => {
    const doc = reviewSheet([['文言を直す', 'ケース.tsv#No.=1', '反映済み']]);
    const target: ReviewTarget = { doc: CASES, changedRows: null };

    expect(checkReview(doc, COLUMNS, only('ケース.tsv', target))).toEqual([]);
  });

  it('クローズには反映を要求しない', () => {
    // 「対応しない」と決めて閉じる指摘がある。要求すると永久に赤いまま残る。
    const doc = reviewSheet([['この仕様で問題ない', 'ケース.tsv#No.=1', 'クローズ']]);
    const target: ReviewTarget = { doc: CASES, changedRows: new Set() };

    expect(checkReview(doc, COLUMNS, only('ケース.tsv', target))).toEqual([]);
  });

  it('未着手・提案済みには反映を要求しない', () => {
    const doc = reviewSheet([
      ['まだ見ていない', 'ケース.tsv#No.=1', '未着手'],
      ['こう直すのはどうか', 'ケース.tsv#No.=2', '提案済み'],
    ]);
    const target: ReviewTarget = { doc: CASES, changedRows: new Set() };

    expect(checkReview(doc, COLUMNS, only('ケース.tsv', target))).toEqual([]);
  });

  it('反映済みなのに対象が空なら止める', () => {
    const doc = reviewSheet([['文言を直す', '', '反映済み']]);

    const issues = checkReview(doc, COLUMNS, () => null);

    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe('review_target_blank');
    expect(issues[0]?.severity).toBe('error');
    expect(issues[0]?.column).toBe(1);
  });

  it('反映済み以外なら対象が空でも言わない', () => {
    // 起票した直後は指し先が定まっていない。書く前から赤いと、書く気が失せる。
    const doc = reviewSheet([
      ['まだ見ていない', '', '未着手'],
      ['方針だけ先に決める', '', '提案済み'],
      ['対応しないと決めた', '', 'クローズ'],
    ]);

    expect(checkReview(doc, COLUMNS, () => null)).toEqual([]);
  });

  it('対象がリンクとして読めなければ止める', () => {
    const doc = reviewSheet([['文言を直す', 'ケース表の 12 番あたり', '提案済み']]);

    const issues = checkReview(doc, COLUMNS, () => null);

    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe('review_target_unreadable');
    expect(issues[0]?.severity).toBe('error');
    expect(issues[0]?.column).toBe(1);
  });

  it('指した行が指し先に無ければ止める', () => {
    const doc = reviewSheet([['文言を直す', 'ケース.tsv#No.=99', '提案済み']]);
    const target: ReviewTarget = { doc: CASES, changedRows: new Set() };

    const issues = checkReview(doc, COLUMNS, only('ケース.tsv', target));

    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe('review_target_not_found');
    expect(issues[0]?.severity).toBe('error');
  });

  it('指した列が指し先に無ければ警告', () => {
    const doc = reviewSheet([['文言を直す', 'ケース.tsv#観点#=A-1', '提案済み']]);
    const target: ReviewTarget = { doc: CASES, changedRows: new Set() };

    const issues = checkReview(doc, COLUMNS, only('ケース.tsv', target));

    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe('review_target_column_missing');
    expect(issues[0]?.severity).toBe('warning');
  });

  it('指し先を読めなければ警告にとどめる', () => {
    // ワークスペースの一部だけを開いていることがある。読めないだけで止めない。
    const doc = reviewSheet([['文言を直す', 'ケース.tsv#No.=1', '反映済み']]);

    const issues = checkReview(doc, COLUMNS, () => null);

    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe('review_target_file_missing');
    expect(issues[0]?.severity).toBe('warning');
  });

  it('対象が複数の行に当たれば警告し、どれかが変わっていれば反映とみなす', () => {
    const cases = caseSheet([
      ['1', '同じ項目', 'OK'],
      ['2', '同じ項目', 'OK'],
    ]);
    const doc = reviewSheet([['文言を直す', 'ケース.tsv#項目=同じ項目', '反映済み']]);
    const target: ReviewTarget = { doc: cases, changedRows: new Set([1]) };

    const issues = checkReview(doc, COLUMNS, only('ケース.tsv', target));

    expect(issues.map((issue) => issue.code)).toEqual(['review_target_ambiguous']);
    expect(issues[0]?.severity).toBe('warning');
  });

  it('行まで指していない対象は、反映済みのときだけ裏取りできないと言う', () => {
    const doc = reviewSheet([
      ['この文書全体', 'ケース.tsv', '反映済み'],
      ['この文書全体', 'ケース.tsv', '提案済み'],
    ]);
    const target: ReviewTarget = { doc: CASES, changedRows: new Set() };

    const issues = checkReview(doc, COLUMNS, only('ケース.tsv', target));

    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe('review_unverifiable');
    expect(issues[0]?.severity).toBe('warning');
    expect(issues[0]?.row).toBe(0);
    expect(issues[0]?.column).toBe(2);
  });

  it('外部リンクを指した対象も裏取りできない扱いにする', () => {
    const doc = reviewSheet([['起票元', 'https://example.invalid/issues/1', '反映済み']]);

    const issues = checkReview(doc, COLUMNS, () => null);

    expect(issues.map((issue) => issue.code)).toEqual(['review_unverifiable']);
  });

  it('同じシートの行を指す対象も裏取りできる', () => {
    const doc = reviewSheet([['自分の行を指す', '#指摘=自分の行を指す', '反映済み']]);
    const target: ReviewTarget = { doc, changedRows: new Set([0]) };

    expect(checkReview(doc, COLUMNS, (asked) => (asked === null ? target : null))).toEqual([]);
  });

  it('状態が空の行は何も言わない', () => {
    const doc = reviewSheet([['まだ書きかけ', 'ケース表の 12 番あたり', '']]);

    expect(checkReview(doc, COLUMNS, () => null)).toEqual([]);
  });

  it('セルが足りない行でも落ちない', () => {
    const doc = reviewSheet([['書きかけ']]);

    expect(checkReview(doc, COLUMNS, () => null)).toEqual([]);
  });
});
