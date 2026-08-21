import { describe, it, expect } from 'vitest';
import { parseTsv } from '@md-business/schema-test-spec-tsv';
import { planSheetExpansion } from './sheetExpand';

const TAB = String.fromCharCode(9);

function sheet(directives: readonly string[], rows: readonly (readonly string[])[]) {
  return parseTsv(
    [
      '#! md-business:test-spec-tsv/v1',
      ...directives.map((directive) => `#@ ${directive}`),
      ['No.', '観点キー', '手順', '結果:enum(OK|NG)'].join(TAB),
      ...rows.map((cells) => cells.join(TAB)),
    ].join('\n'),
  );
}

const MASTER = [
  '#! md-business:test-spec-tsv/v1',
  ['観点キー', '手順'].join(TAB),
  ['V-01', '未ログインで開く'].join(TAB),
  ['V-02', '最大文字数を入れる'].join(TAB),
].join('\n');

function reader(files: Record<string, string>) {
  return async (relPath: string) => files[relPath] ?? null;
}

describe('planSheetExpansion', () => {
  it('宣言が無ければ何も返さない', async () => {
    expect(await planSheetExpansion(sheet([], []), 'docs/test-specs/001.tsv', reader({}))).toEqual(
      [],
    );
  });

  it('開いているシートからの相対でマスタを読む', async () => {
    const [expansion] = await planSheetExpansion(
      sheet(['expand ../共通観点.tsv key=観点キー columns=手順'], []),
      'docs/test-specs/001.tsv',
      reader({ 'docs/共通観点.tsv': MASTER }),
    );

    expect(expansion?.path).toBe('docs/共通観点.tsv');
    expect(expansion?.found).toBe(true);
    expect(expansion?.keys).toEqual(['V-01', 'V-02']);
  });

  it('控えにした行のキーも「既にある」として数える（展開のたびに増やさない）', async () => {
    const [expansion] = await planSheetExpansion(
      sheet(['expand 共通観点.tsv key=観点キー columns=手順'], [['1', 'V-01', '手順', '']]),
      'docs/test-specs/001.tsv',
      reader({ 'docs/test-specs/共通観点.tsv': MASTER }),
    );

    expect(expansion?.keys).toEqual(['V-02']);
  });

  it('マスタを読めなければ、読めなかったこととして返す（他の宣言は続ける）', async () => {
    const [expansion] = await planSheetExpansion(
      sheet(['expand 共通観点.tsv key=観点キー columns=手順'], []),
      'docs/test-specs/001.tsv',
      reader({}),
    );

    expect(expansion?.found).toBe(false);
    expect(expansion?.rows).toEqual([]);
  });

  it('列を持たないファイルは読めなかったのと同じ', async () => {
    const [expansion] = await planSheetExpansion(
      sheet(['expand 共通観点.tsv key=観点キー columns=手順'], []),
      'docs/test-specs/001.tsv',
      reader({ 'docs/test-specs/共通観点.tsv': '#! md-business:test-spec-tsv/v1' }),
    );

    expect(expansion?.found).toBe(false);
  });
});
