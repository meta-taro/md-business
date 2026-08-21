/**
 * 開いている検証シートの展開宣言（`#@ expand`）を、マスタを読んで組み立てる。
 *
 * 何を足すかの判断はスキーマ側（`planExpansion`）に置いてある。ここが持つのは
 * **マスタをどう読むか**だけ:
 *
 * - パスは開いているシートのある場所からの相対（`#@ link` と同じ規則）
 * - 読めないマスタは「読めなかった」として 1 件返し、残りの宣言を続ける。
 *   ワークスペースの一部だけを開いていることがあり、そこで全部止めると何も展開できない
 *
 * fs にも Tauri にも触れず、読み取りを引数で受け取るので単体で検査できる。
 */
import {
  parseTsv,
  planExpansion,
  readExpandRules,
  type ExpandPlan,
  type TsvDocument,
} from '@md-business/schema-test-spec-tsv';
import { resolveRelPath } from '../workspace/relPath';
import type { SheetReader } from './linkCheck';

/** 宣言 1 本ぶんの展開結果。 */
export interface SheetExpansion extends ExpandPlan {
  /** マスタ（ルートからの相対）。解けなかったときは書かれたまま。 */
  path: string;
  /** マスタを読めたか。読めなければ足せる行も無い。 */
  found: boolean;
}

const NOTHING = { rows: [], keys: [], missingColumns: [], orphans: [], skipped: 0 } as const;

/**
 * 展開してみる。**ここでは何も書き換えない。**足すかどうかは呼ぶ側が決める。
 *
 * @param doc いま開いているシート（控え行も含めたもの）
 * @param activePath そのシートのルートからの相対パス（未オープンなら null）
 * @param read マスタの読み取り
 */
export async function planSheetExpansion(
  doc: TsvDocument,
  activePath: string | null,
  read: SheetReader,
): Promise<SheetExpansion[]> {
  if (activePath === null) return [];

  const rules = readExpandRules(
    doc.directives,
    doc.columns.map((column) => column.name),
  );
  const expansions: SheetExpansion[] = [];

  for (const rule of rules) {
    const path = resolveRelPath(activePath, rule.path);
    // 解けない書き方（`..` で外へ出るなど）は、書いたとおりの字を返して読めないと言う。
    if (path === null) {
      expansions.push({ ...NOTHING, path: rule.path, found: false });
      continue;
    }
    const source = await read(path);
    const master = source === null ? null : parseTsv(source);
    // ヘッダを読めないファイルは、指しても列を引けない＝読めなかったのと同じに扱う。
    if (master === null || master.columns.length === 0) {
      expansions.push({ ...NOTHING, path, found: false });
      continue;
    }
    expansions.push({ ...planExpansion(doc, rule, master), path, found: true });
  }

  return expansions;
}
