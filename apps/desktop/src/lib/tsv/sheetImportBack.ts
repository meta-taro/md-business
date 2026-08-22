/**
 * 提出様式で出した表を、貼り付けから正本へ戻す。
 *
 * 何を当てるかの判断はスキーマ側（`planImportBack`）に置いてある。ここが足すのは
 * **貼り付けの作法**だけで、持ち出し（`sheetExport`）と同じ読み書きを使う。別々に持つと、
 * 出した文字列を貼り戻せない組み合わせができる。
 *
 * 当てるのは計画にあるセルだけ。行は足さないので、行 ID を載せた doc をそのまま通せる。
 */
import {
  planImportBack,
  type ExportProfile,
  type ImportBackChange,
  type ImportBackPlan,
  type TsvDocument,
} from '@md-business/schema-test-spec-tsv';
import { parseClipboardMatrix } from './clipboardCodec';

/** 貼り付けられた文字列を表として読み、様式に従って戻す計画を立てる。 */
export function planSheetImportBack(
  doc: TsvDocument,
  profile: ExportProfile,
  text: string,
): ImportBackPlan {
  return planImportBack(doc, profile, parseClipboardMatrix(text));
}

/**
 * 計画のセルだけを書き換えた **新しい** doc を返す（入力は不変）。
 *
 * 1 つも変わらないなら入力をそのまま返す（履歴に空のスナップショットを積まない）。
 */
export function applyImportBack<T extends TsvDocument>(
  doc: T,
  changes: readonly ImportBackChange[],
): T {
  if (changes.length === 0) return doc;

  const byRow = new Map<number, ImportBackChange[]>();
  for (const change of changes) {
    // 計画を立てたときと doc が変わっていることがある（貼ってから当てるまでの間の編集）。
    // 無い行へは書かない。
    if (doc.rows[change.row] === undefined) continue;
    const found = byRow.get(change.row);
    if (found === undefined) byRow.set(change.row, [change]);
    else found.push(change);
  }
  if (byRow.size === 0) return doc;

  const rows = doc.rows.map((cells, row) => {
    const targets = byRow.get(row);
    if (targets === undefined) return cells;

    const next = cells.slice();
    for (const change of targets) {
      // 末尾セルが省略された短い行は空で詰めてから設定する。
      while (next.length <= change.column) next.push('');
      next[change.column] = change.after;
    }
    return next;
  });

  return { ...doc, rows };
}
