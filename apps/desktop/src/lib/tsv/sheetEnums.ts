/**
 * 開いている検証シートの `種別:enum(-> <ファイル>#<列名>)` について、
 * 参照先のファイルを読んで選択肢を集める。
 *
 * 値の集め方そのものはスキーマ側（`collectEnumChoices`）に置いてある。ここが持つのは
 * **相手をどう読むか**だけ:
 *
 * - パスは開いているシートのある場所からの相対（セルのリンク・`#@ link` と同じ規則）
 * - 読めない相手はその列を結果に載せない。空の選択肢として載せると、参照先を
 *   開いていないだけで既存の値が一斉に不正になる
 *
 * fs にも Tauri にも触れず、読み取りを引数で受け取るので単体で検査できる。
 */
import {
  collectEnumChoices,
  parseTsv,
  type EnumChoices,
  type TsvDocument,
} from '@md-business/schema-test-spec-tsv';
import { resolveRelPath } from '../workspace/relPath';
import type { SheetReader } from './linkCheck';

/**
 * 参照先から選択肢を引く。引けなかった列は結果に載せない（＝その列の検査を飛ばす）。
 *
 * @param doc いま開いているシート
 * @param activePath そのシートのルートからの相対パス（未オープンなら null）
 * @param read 参照先の読み取り
 */
export async function readSheetEnums(
  doc: TsvDocument,
  activePath: string | null,
  read: SheetReader,
): Promise<EnumChoices> {
  const choices = new Map<number, readonly string[]>();
  if (activePath === null) return choices;

  for (const [index, column] of doc.columns.entries()) {
    const source = column.enumSource;
    if (source === undefined) continue;

    const otherPath = resolveRelPath(activePath, source.path);
    const text = otherPath === null ? null : await read(otherPath);
    if (text === null) continue;

    const collected = collectEnumChoices(parseTsv(text), source.column);
    if (collected !== null) choices.set(index, collected);
  }

  return choices;
}
