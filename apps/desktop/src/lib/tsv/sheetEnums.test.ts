import { describe, expect, it } from 'vitest';
import { parseTsv } from '@md-business/schema-test-spec-tsv';
import { readSheetEnums } from './sheetEnums';

/** 選択肢を提出物側から引く受付シート。 */
const RECEPTION =
  ['No.:number\t種別:enum(-> 提出物.tsv#種別)', '1\t仕様書', '2\t絵日記'].join('\n') + '\n';

/** 選択肢の正本。同じ値が何度も並ぶ普通のデータ列でもよい。 */
const DELIVERABLES =
  ['種別!\t期限', '仕様書\t月末', '議事録\t翌日', '仕様書\t月末', '\t即日'].join('\n') + '\n';

function reader(files: Record<string, string>) {
  return async (relPath: string): Promise<string | null> => files[relPath] ?? null;
}

describe('readSheetEnums', () => {
  it('参照先の列の値を重複を畳んで返す', async () => {
    const choices = await readSheetEnums(
      parseTsv(RECEPTION),
      'sheets/受付.tsv',
      reader({ 'sheets/提出物.tsv': DELIVERABLES }),
    );

    expect(choices.get(1)).toEqual(['仕様書', '議事録']);
  });

  it('参照先を読めなければ載せない', async () => {
    // 空の選択肢として載せると、開いていないだけで既存の値が一斉に不正になる。
    const choices = await readSheetEnums(parseTsv(RECEPTION), 'sheets/受付.tsv', reader({}));

    expect(choices.has(1)).toBe(false);
  });

  it('参照先に指した列が無ければ載せない', async () => {
    const choices = await readSheetEnums(
      parseTsv(RECEPTION),
      'sheets/受付.tsv',
      reader({ 'sheets/提出物.tsv': '名称\t期限\n仕様書\t月末\n' }),
    );

    expect(choices.has(1)).toBe(false);
  });

  it('参照を宣言していない列は引かない', async () => {
    const choices = await readSheetEnums(
      parseTsv('No.:number\t結果:enum(OK|NG)\n1\tOK\n'),
      'sheets/受付.tsv',
      reader({}),
    );

    expect(choices.size).toBe(0);
  });

  it('シートを開いていなければ空', async () => {
    const choices = await readSheetEnums(
      parseTsv(RECEPTION),
      null,
      reader({ 'sheets/提出物.tsv': DELIVERABLES }),
    );

    expect(choices.size).toBe(0);
  });
});
