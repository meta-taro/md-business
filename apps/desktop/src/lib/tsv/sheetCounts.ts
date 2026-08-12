/**
 * 開いている検証シートの集計列（`#@ computed <列名> = countIn(<ファイル>)`）を、
 * 数える相手のファイルを読んで数える。
 *
 * 数え方そのものはスキーマ側（`countReferences`）に置いてある。ここが持つのは
 * **相手をどう読むか**だけ:
 *
 * - パスは開いているシートのある場所からの相対（セルのリンク・`#@ link` と同じ規則）
 * - 読めない相手はその列を結果に載せない。0 を載せると「参照が 1 件も無い」と
 *   区別がつかず、開いていないだけの状態が件数としてファイルへ焼かれる
 *
 * fs にも Tauri にも触れず、読み取りを引数で受け取るので単体で検査できる。
 */
import {
  countReferences,
  parseTsv,
  readComputedColumns,
  type ComputedCounts,
  type TsvDocument,
} from '@md-business/schema-test-spec-tsv';
import { resolveRelPath } from '../workspace/relPath';
import type { SheetReader } from './linkCheck';

/**
 * 集計列を数える。数えられなかった列は結果に載せない（＝セルに触らない）。
 *
 * @param doc いま開いているシート
 * @param activePath そのシートのルートからの相対パス（未オープンなら null）
 * @param read 数える相手の読み取り
 */
export async function countSheetReferences(
  doc: TsvDocument,
  activePath: string | null,
  read: SheetReader,
): Promise<ComputedCounts> {
  const counts = new Map<number, readonly number[]>();
  if (activePath === null) return counts;

  const computed = readComputedColumns(
    doc.directives,
    doc.columns.map((column) => column.name),
  );

  for (const column of computed) {
    if (column.formula !== 'countIn' || column.source === undefined) continue;

    const otherPath = resolveRelPath(activePath, column.source);
    const source = otherPath === null ? null : await read(otherPath);
    if (source === null || otherPath === null) continue;

    const other = parseTsv(source);
    // ヘッダを読めないファイルは、指しても列を引けない＝読めなかったのと同じに扱う。
    if (other.columns.length === 0) continue;

    const counted = countReferences(doc, activePath, other, otherPath);
    if (counted !== null) counts.set(column.columnIndex, counted);
  }

  return counts;
}
