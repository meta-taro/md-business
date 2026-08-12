/**
 * 開いている検証シートのリンク定義（`#@ link`）を、参照先ファイルを読んで照合する。
 *
 * 照合そのものはスキーマ側（`checkColumnLink`）に置いてある。ここが持つのは
 * **参照先をどう読むか**だけ:
 *
 * - パスは開いているシートのある場所からの相対（セルのリンクと同じ規則）
 * - 読めない参照先は 1 本ぶんの警告にして残りを続ける。ワークスペースの一部だけを
 *   開いていることがあり、そこで全部止めると「開くたびに赤い」になって本物が埋もれる
 *
 * fs にも Tauri にも触れず、読み取りを引数で受け取るので単体で検査できる。
 */
import {
  checkColumnLink,
  parseTsv,
  readColumnLinks,
  type LinkIssue,
  type TsvDocument,
} from '@md-business/schema-test-spec-tsv';
import { resolveRelPath } from '../workspace/relPath';

/** 照合結果 1 件。参照先側の位置は相手ファイルの中なので、どのファイルかを添える。 */
export interface SheetLinkIssue extends LinkIssue {
  /** 参照先ファイル（ルートからの相対）。解けなかったときは書かれたまま。 */
  targetPath: string;
}

/** ルートからの相対パスで 1 ファイル読む。読めなければ null。 */
export type SheetReader = (relPath: string) => Promise<string | null>;

/**
 * リンク定義を両方向に照合する。
 *
 * @param doc いま開いているシート
 * @param activePath そのシートのルートからの相対パス（未オープンなら null）
 * @param read 参照先の読み取り
 */
export async function checkSheetLinks(
  doc: TsvDocument,
  activePath: string | null,
  read: SheetReader,
): Promise<SheetLinkIssue[]> {
  if (activePath === null) return [];

  const links = readColumnLinks(
    doc.directives,
    doc.columns.map((column) => column.name),
  );
  const issues: SheetLinkIssue[] = [];

  for (const link of links) {
    const targetPath = resolveRelPath(activePath, link.path);
    const source = targetPath === null ? null : await read(targetPath);
    const target = source === null ? null : parseTsv(source);
    // ヘッダを読めないファイルは、指しても列を引けない＝読めなかったのと同じに扱う。
    const usable = target !== null && target.columns.length > 0 ? target : null;

    for (const issue of checkColumnLink(doc, link, usable)) {
      issues.push({ ...issue, targetPath: targetPath ?? link.path });
    }
  }

  return issues;
}
