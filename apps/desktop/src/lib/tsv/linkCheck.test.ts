import { describe, expect, it } from 'vitest';
import { parseTsv } from '@md-business/schema-test-spec-tsv';
import { checkSheetLinks } from './linkCheck';

/** 参照元。ケースの列が別ファイルの観点を指す。 */
const CASES =
  ['#@ link 観点 -> 観点.tsv#観点#', 'No.:number\t観点', '1\tA-1, A-2', '2\tA-9'].join('\n') + '\n';

/** 参照先。A-3 はどのケースからも指されていない。 */
const POINTS = ['観点#!\t内容', 'A-1\t必須項目', 'A-2\t重複', 'A-3\t桁あふれ'].join('\n') + '\n';

/** ルートからの相対パス → 中身。無いものは null（読めない状態を再現する）。 */
function reader(files: Record<string, string>) {
  return async (relPath: string): Promise<string | null> => files[relPath] ?? null;
}

describe('checkSheetLinks', () => {
  it('参照先に無い値と、誰も参照していない参照先の行を返す', async () => {
    const issues = await checkSheetLinks(
      parseTsv(CASES),
      'sheets/ケース.tsv',
      reader({ 'sheets/観点.tsv': POINTS }),
    );

    expect(issues).toEqual([
      expect.objectContaining({
        code: 'link_unknown_value',
        severity: 'error',
        side: 'source',
        row: 1,
        column: 1,
        value: 'A-9',
        targetPath: 'sheets/観点.tsv',
      }),
      expect.objectContaining({
        code: 'link_unreferenced_row',
        severity: 'warning',
        side: 'target',
        row: 2,
        value: 'A-3',
        targetPath: 'sheets/観点.tsv',
      }),
    ]);
  });

  it('参照先は開いているシートのある場所からの相対で解く', async () => {
    const issues = await checkSheetLinks(
      parseTsv(['#@ link 観点 -> ../観点.tsv#観点', '観点', 'A-1'].join('\n') + '\n'),
      'sheets/case/ケース.tsv',
      reader({ 'sheets/観点.tsv': ['観点', 'A-1'].join('\n') + '\n' }),
    );

    expect(issues).toEqual([]);
  });

  it('参照先を読めないときは警告 1 件だけ返す', async () => {
    const issues = await checkSheetLinks(parseTsv(CASES), 'sheets/ケース.tsv', reader({}));

    expect(issues).toEqual([
      expect.objectContaining({ code: 'link_target_missing', severity: 'warning' }),
    ]);
  });

  it('ファイルを開いていなければ照合しない', async () => {
    expect(await checkSheetLinks(parseTsv(CASES), null, reader({}))).toEqual([]);
  });

  it('リンク定義が無ければ空配列', async () => {
    const issues = await checkSheetLinks(
      parseTsv('No.:number\t項目\n1\ta\n'),
      'x.tsv',
      reader({}),
    );

    expect(issues).toEqual([]);
  });
});
