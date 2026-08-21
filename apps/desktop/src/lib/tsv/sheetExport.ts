/**
 * 提出様式（`#@ export`）でシートを持ち出す。
 *
 * 様式の定義と表の組み立てはスキーマ側が持つ。ここが足すのは**出し先の作法**だけで、
 * いまのところ「表計算へ貼れる文字列」1 つ。セル内の改行やタブは囲みで守る必要があり、
 * その判断は貼り付け側（`clipboardCodec`）と同じものを使う。別々に持つと、貼って戻せない
 * 文字列を作ってしまう。
 *
 * 控え行（`#@ hidden`）を含めるかどうかはここでは決めない。渡された doc がすべてで、
 * 控えを表に出したまま渡せば提出物にも出る。表示の都合を持ち出しの都合に混ぜない。
 */
import {
  buildExportTable,
  readExportProfiles,
  type ExportProfile,
  type TsvDocument,
} from '@md-business/schema-test-spec-tsv';
import { serializeClipboardMatrix } from './clipboardCodec';

/** このシートが宣言している提出様式。宣言が無ければ空。 */
export function readSheetExportProfiles(doc: TsvDocument): ExportProfile[] {
  return readExportProfiles(
    doc.directives,
    doc.columns.map((column) => column.name),
  );
}

/**
 * 様式に従って、表計算へ貼れる文字列にする。見出し 1 行のあとにデータ行。
 *
 * 貼り付ける相手が Excel でも Google Sheets でも同じ形で受かる（タブ区切り・改行区切り・
 * 特別な字を含むセルは二重引用符で囲む）。
 */
export function exportProfileText(doc: TsvDocument, profile: ExportProfile): string {
  const table = buildExportTable(doc, profile);
  return serializeClipboardMatrix([table.columns, ...table.rows]);
}
