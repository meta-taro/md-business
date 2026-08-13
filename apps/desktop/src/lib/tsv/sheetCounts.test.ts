import { describe, expect, it } from 'vitest';
import { parseTsv } from '@md-business/schema-test-spec-tsv';
import { countSheetReferences } from './sheetCounts';

/** 数えられる側（観点の一覧）。関係は書かず、数える相手の名前だけを書く。 */
const POINTS =
  ['#@ computed 件数 = countIn(ケース.tsv)', '観点#!\t内容\t件数', 'A-1\t必須項目\t', 'A-2\t重複\t'].join(
    '\n',
  ) + '\n';

/** 数える元（ケースの一覧）。どの列とどの列が対応するかはこちらに 1 本だけある。 */
const CASES =
  ['#@ link 観点 -> 観点.tsv#観点#', 'No.:number\t観点', '1\tA-1', '2\tA-1'].join('\n') + '\n';

/** ルートからの相対パス → 中身。無いものは null（読めない状態を再現する）。 */
function reader(files: Record<string, string>) {
  return async (relPath: string): Promise<string | null> => files[relPath] ?? null;
}

describe('countSheetReferences', () => {
  it('参照している側の行数を列ごとに返す', async () => {
    const counts = await countSheetReferences(
      parseTsv(POINTS),
      'sheets/観点.tsv',
      reader({ 'sheets/ケース.tsv': CASES }),
    );

    // A-1 は 2 件、A-2 は 0 件。列の位置（2）で引ける形にする。
    expect(counts.get(2)).toEqual([2, 0]);
  });

  it('数える相手を読めなければ載せない', async () => {
    // 0 を載せると「参照が 1 件も無い」と区別がつかず、開いていないだけの状態が
    // 件数としてファイルへ焼かれる。
    const counts = await countSheetReferences(parseTsv(POINTS), 'sheets/観点.tsv', reader({}));

    expect(counts.has(2)).toBe(false);
  });

  it('相手がこちらを指していなければ載せない', async () => {
    const counts = await countSheetReferences(
      parseTsv(POINTS),
      'sheets/観点.tsv',
      reader({ 'sheets/ケース.tsv': ['#@ link 観点 -> ほかの表.tsv#観点#', '観点', 'A-1'].join('\n') }),
    );

    expect(counts.has(2)).toBe(false);
  });

  it('相手は開いているシートのある場所からの相対で読む', async () => {
    const points =
      ['#@ computed 件数 = countIn(../case/ケース.tsv)', '観点#\t件数', 'A-1\t'].join('\n') + '\n';
    const cases = ['#@ link 観点 -> ../point/観点.tsv#観点#', '観点', 'A-1'].join('\n') + '\n';

    const counts = await countSheetReferences(
      parseTsv(points),
      'point/観点.tsv',
      reader({ 'case/ケース.tsv': cases }),
    );

    expect(counts.get(1)).toEqual([1]);
  });

  it('まだ開いていないシートでは数えない', async () => {
    const counts = await countSheetReferences(parseTsv(POINTS), null, reader({}));

    expect(counts.size).toBe(0);
  });

  it('集計の宣言が無ければ何も読まない', async () => {
    let reads = 0;
    const counts = await countSheetReferences(parseTsv(CASES), 'sheets/ケース.tsv', async () => {
      reads += 1;
      return null;
    });

    expect(counts.size).toBe(0);
    expect(reads).toBe(0);
  });
});
