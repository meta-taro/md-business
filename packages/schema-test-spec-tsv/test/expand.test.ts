import { describe, it, expect } from 'vitest';
import { planExpansion, readExpandRules } from '../src/expand.js';
import { parseTsv } from '../src/parse.js';
import type { TsvDocument } from '../src/parse.js';

/**
 * 共通観点マスタからの展開。
 *
 * 権限・文字数上限・連打・タブ移動順といった観点は、機能が変わってもほぼ同じ文面になる。
 * それを機能ごとに手で書き写しているので、**観点を 1 つ足したときに既存のシートへ行き渡らない**。
 * 対象が大きいほど効く（画面の数だけ写す先がある）。
 *
 * 最重要契約:
 * - **既にある行には触らない**。展開し直しは「足りないキーを足す」だけ。人が入れた結果や
 *   直した手順を、マスタの文面で上書きしない（上書きすると、消えたことに気づけない）。
 * - **`columns=` は必須**。既定で全列を写すと、マスタ側の `結果` 列まで写って
 *   「もう試したことになっている行」が量産される。
 * - **文面のずれは黙る**。写したあと現場で直したのか、マスタが更新されたのかを、
 *   こちらからは見分けられない（`#@ link` / `#@ review` と同じ判断）。
 */

const TAB = String.fromCharCode(9);

function sheet(
  columns: readonly string[],
  rows: readonly (readonly string[])[],
  directives: readonly string[] = [],
): TsvDocument {
  return parseTsv(
    [
      '#! md-business:test-spec-tsv/v1',
      ...directives.map((directive) => `#@ ${directive}`),
      columns.join(TAB),
      ...rows.map((cells) => cells.join(TAB)),
    ].join('\n'),
  );
}

/** 展開先（案件のシート）。観点キーを持ち、写した文面と人が入れる結果が並ぶ。 */
const CASE_COLUMNS = ['No.', '観点キー', '区分', '手順', '結果:enum(OK|NG)'];

/** マスタ。適用先の絞り込み列を持つ。 */
const MASTER_COLUMNS = ['観点キー', '区分', '手順', '適用', '結果:enum(OK|NG)'];

describe('readExpandRules', () => {
  it('宣言が無ければ空', () => {
    expect(readExpandRules([], CASE_COLUMNS)).toEqual([]);
  });

  it('マスタと写す列を読む', () => {
    const rules = readExpandRules(
      ['expand ../共通観点.tsv key=観点キー columns=区分,手順'],
      CASE_COLUMNS,
    );

    expect(rules).toEqual([
      { path: '../共通観点.tsv', key: '観点キー', columns: ['区分', '手順'], apply: null, values: [] },
    ]);
  });

  it('適用先で絞れる', () => {
    const [rule] = readExpandRules(
      ['expand 観点.tsv key=観点キー columns=手順 apply=適用 for=画面, 入力'],
      CASE_COLUMNS,
    );

    expect(rule?.apply).toBe('適用');
    expect(rule?.values).toEqual(['画面', '入力']);
  });

  it('`columns=` を書かなければ宣言ごと捨てる（マスタの結果列まで写さないため）', () => {
    expect(readExpandRules(['expand 観点.tsv key=観点キー'], CASE_COLUMNS)).toEqual([]);
  });

  it('キー列がこのシートに無ければ捨てる', () => {
    expect(readExpandRules(['expand 観点.tsv key=無い列 columns=手順'], CASE_COLUMNS)).toEqual([]);
  });

  it('写す先の列がこのシートに無ければ捨てる', () => {
    expect(
      readExpandRules(['expand 観点.tsv key=観点キー columns=手順,無い列'], CASE_COLUMNS),
    ).toEqual([]);
  });

  it('`for=` だけ、`apply=` だけは捨てる', () => {
    expect(
      readExpandRules(['expand 観点.tsv key=観点キー columns=手順 for=画面'], CASE_COLUMNS),
    ).toEqual([]);
    expect(
      readExpandRules(['expand 観点.tsv key=観点キー columns=手順 apply=適用'], CASE_COLUMNS),
    ).toEqual([]);
  });

  it('知らないオプション・その PC でしか開けないパス・列を持たない相手は捨てる', () => {
    expect(
      readExpandRules(['expand 観点.tsv key=観点キー columns=手順 mode=強制'], CASE_COLUMNS),
    ).toEqual([]);
    expect(
      readExpandRules(['expand C:/tmp/観点.tsv key=観点キー columns=手順'], CASE_COLUMNS),
    ).toEqual([]);
    expect(
      readExpandRules(['expand 観点.md key=観点キー columns=手順'], CASE_COLUMNS),
    ).toEqual([]);
  });
});

describe('planExpansion', () => {
  const rule = readExpandRules(
    ['expand 観点.tsv key=観点キー columns=区分,手順'],
    CASE_COLUMNS,
  )[0]!;

  it('マスタの行を、このシートの列の並びで足す', () => {
    const doc = sheet(CASE_COLUMNS, []);
    const master = sheet(MASTER_COLUMNS, [['V-01', '権限', '未ログインで開く', '画面', 'OK']]);

    const plan = planExpansion(doc, rule, master);

    expect(plan.rows).toEqual([['', 'V-01', '権限', '未ログインで開く', '']]);
    expect(plan.keys).toEqual(['V-01']);
  });

  it('既にあるキーは足さない（人が入れた結果に触れない）', () => {
    const doc = sheet(CASE_COLUMNS, [['1', 'V-01', '権限', '直した手順', 'NG']]);
    const master = sheet(MASTER_COLUMNS, [
      ['V-01', '権限', 'マスタの手順', '画面', ''],
      ['V-02', '上限', '最大文字数を入れる', '入力', ''],
    ]);

    const plan = planExpansion(doc, rule, master);

    expect(plan.keys).toEqual(['V-02']);
    expect(doc.rows[0]).toEqual(['1', 'V-01', '権限', '直した手順', 'NG']);
  });

  it('マスタから消えたキーは知らせる（勝手に消さない）', () => {
    const doc = sheet(CASE_COLUMNS, [['1', 'V-09', '権限', '前の観点', '']]);
    const master = sheet(MASTER_COLUMNS, [['V-01', '権限', '未ログインで開く', '画面', '']]);

    const plan = planExpansion(doc, rule, master);

    expect(plan.orphans).toEqual(['V-09']);
  });

  it('適用先で絞る（多値のセルはどれか当たれば足す）', () => {
    const filtered = readExpandRules(
      ['expand 観点.tsv key=観点キー columns=手順 apply=適用 for=入力'],
      CASE_COLUMNS,
    )[0]!;
    const doc = sheet(CASE_COLUMNS, []);
    const master = sheet(MASTER_COLUMNS, [
      ['V-01', '権限', '未ログインで開く', '画面', ''],
      ['V-02', '上限', '最大文字数を入れる', '画面,入力', ''],
    ]);

    expect(planExpansion(doc, filtered, master).keys).toEqual(['V-02']);
  });

  it('キーの無いマスタ行は飛ばす（後から追えないので写さない）', () => {
    const doc = sheet(CASE_COLUMNS, []);
    const master = sheet(MASTER_COLUMNS, [
      ['', '権限', '見出しのつもりの行', '画面', ''],
      ['V-01', '権限', '未ログインで開く', '画面', ''],
    ]);

    const plan = planExpansion(doc, rule, master);

    expect(plan.keys).toEqual(['V-01']);
    expect(plan.skipped).toBe(1);
  });

  it('マスタに無い列を指していたら、何も足さずに知らせる', () => {
    const doc = sheet(CASE_COLUMNS, []);
    const master = sheet(['観点キー', '区分'], [['V-01', '権限']]);

    const plan = planExpansion(doc, rule, master);

    expect(plan.missingColumns).toEqual(['手順']);
    expect(plan.rows).toEqual([]);
    expect(plan.orphans).toEqual([]);
  });
});
