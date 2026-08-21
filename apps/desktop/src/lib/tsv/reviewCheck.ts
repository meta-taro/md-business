/**
 * 開いている指摘の一覧（`#@ review`）を、指し先のファイルを読んで裏取りする。
 *
 * 判定そのものはスキーマ側（`checkReview`）に置いてある。ここが持つのは
 * **どの版と比べるか・指し先をどう読むか**だけ:
 *
 * - 指し先は「いまの中身」と「基準版」の 2 つを読む。片方でも欠ければ裏取りしない
 * - 裏取りできないものを赤くしない。赤が普通になると本物の指摘が埋もれる
 * - 同じファイルを何行が指しても、読み取りは 1 回で足りる
 *
 * 同じシートの中を指した行（`#列名=値`）だけは、開いている側で既に前の版と
 * 突き合わせてあるので、その結果を受け取って使う（同じファイルを 2 度読まない）。
 *
 * fs にも Tauri にも触れず、読み取りを引数で受け取るので単体で検査できる。
 */
import {
  checkReview,
  diffSheets,
  parseCellLink,
  parseTsv,
  readReviewColumns,
  withRowIds,
  type ReviewIssue,
  type ReviewTarget,
  type TsvDocument,
} from '@md-business/schema-test-spec-tsv';
import { resolveRelPath } from '../workspace/relPath';
import { isTsvSource } from './detect';
import { rowIdOfCellKey, type SheetComparison } from './sheetCompare';
import type { SheetReader } from './linkCheck';

/** 基準版（比べる相手）の 1 ファイルを読む。その版に無ければ null。 */
export type BaselineReader = (relPath: string) => Promise<string | null>;

/** 裏取りに要るもの。 */
export interface ReviewInput {
  /** いま開いているシートと、そこで変わっている行（比べていなければ `changedRows` は null）。 */
  self: ReviewTarget;
  /** そのシートのルートからの相対パス（未オープンなら null）。 */
  activePath: string | null;
  /** 指し先のいまの中身。 */
  read: SheetReader;
  /** 指し先の基準版。比べていないときは null。 */
  readBaseline: BaselineReader | null;
}

/**
 * 指摘の状態と、指し先の現物を突き合わせる。
 *
 * 宣言が無ければ何もしない（指し先も読みにいかない）。
 */
export async function checkSheetReview(input: ReviewInput): Promise<ReviewIssue[]> {
  const doc = input.self.doc;
  const columns = readReviewColumns(
    doc.directives,
    doc.columns.map((column) => column.name),
  );
  if (columns === null) return [];

  const targets = new Map<string, ReviewTarget | null>();
  for (const path of targetPaths(doc, columns.targetColumn)) {
    targets.set(path, await loadTarget(path, input));
  }

  return checkReview(doc, columns, (path) =>
    path === null ? input.self : (targets.get(path) ?? null),
  );
}

/** 行を指している対象セルから、読むべきファイルを重複なく集める。 */
function targetPaths(doc: TsvDocument, targetColumn: number): Set<string> {
  const paths = new Set<string>();

  for (const cells of doc.rows) {
    const raw = (cells[targetColumn] ?? '').trim();
    if (raw === '') continue;

    const link = parseCellLink(raw);
    // 行を指していないものは裏取りの対象外（どの行が変わるべきかを決められない）。
    if (link === null || link.kind !== 'row' || link.path === null) continue;
    paths.add(link.path);
  }

  return paths;
}

/** 指し先 1 ファイルを、いまの中身と「基準版から変わった行」の組にする。 */
async function loadTarget(path: string, input: ReviewInput): Promise<ReviewTarget | null> {
  const relPath = resolveRelPath(input.activePath, path);
  if (relPath === null) return null;

  const source = await input.read(relPath);
  if (source === null || !isTsvSource(source)) return null;

  const doc = parseTsv(source);
  // ヘッダを読めないファイルは、指しても行を引けない＝読めなかったのと同じに扱う。
  if (doc.columns.length === 0) return null;

  return { doc, changedRows: await changedRows(doc, relPath, input.readBaseline) };
}

/**
 * 基準版と突き合わせて、変わった行の位置を返す。
 *
 * 比べられないときは `null`。空の集合（＝比べたうえで 1 行も変わっていない）と混ぜると、
 * 「比べていない」が「変わっていない」に化けて、反映していない指摘を通してしまう。
 */
async function changedRows(
  doc: TsvDocument,
  relPath: string,
  readBaseline: BaselineReader | null,
): Promise<ReadonlySet<number> | null> {
  if (readBaseline === null) return null;

  const source = await readBaseline(relPath);
  if (source === null || !isTsvSource(source)) return null;

  const diff = diffSheets(parseTsv(source), doc);
  if (!diff.comparable) return null;

  const added = new Set(diff.added);
  const marked = new Set<number>();
  // 突き合わせは行 ID、指摘が指すのは行の位置。並びは保たれるので位置へ戻せる。
  withRowIds(doc).rowIds.forEach((id, at) => {
    if (diff.changed.has(id) || added.has(id)) marked.add(at);
  });

  return marked;
}

/**
 * 開いているシートの突き合わせ結果を、行の位置の集合へ畳む。
 *
 * グリッドの印は行 ID と列名で引くが、指摘が指す先は行の位置なので、ここで揃える。
 */
export function changedRowPositions(
  comparison: SheetComparison | null,
  rowIds: readonly string[],
): ReadonlySet<number> | null {
  if (comparison === null || comparison.issue !== null) return null;

  const ids = new Set<string>(comparison.added);
  for (const key of comparison.changed) ids.add(rowIdOfCellKey(key));

  const marked = new Set<number>();
  rowIds.forEach((id, at) => {
    if (ids.has(id)) marked.add(at);
  });

  return marked;
}
