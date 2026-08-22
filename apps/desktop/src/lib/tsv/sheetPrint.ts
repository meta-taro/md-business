/**
 * 検証シートを紙の版面へ組み直す（DOM 非依存の純ロジック）。
 * ------------------------------------------------------------------
 * グリッドはそのまま刷れない。画面の表は無限にスクロールする前提で、紙の幅も改ページも
 * 持っていないためで、印刷対象にできる形へ一度組み直す必要がある。ここはその組み直しだけを
 * 引き受け、版面の HTML と CSS は renderer-pdf 側が持つ（Web / 拡張と同じものを使うため）。
 *
 * 組み直しで決めているのは次の 4 点。
 * - **表題**: メタの題名。無ければ呼び出し側が渡す名前（開いているファイル名を想定）。
 *   題名に使ったメタは一覧から外す（同じ文字列を表題と一覧に二度出さない）。
 * - **列の幅**: 画面で決めた幅（px）の比をそのまま紙幅へ割り付ける。紙のために別の幅を
 *   持たせると、画面と刷り上がりで列の重みが食い違う。
 * - **地色**: `#@ style` の判定をグリッドと同じ関数で解く。凡例の色と刷り色がずれない。
 * - **計算列**: ここでも算出値へ揃える。グリッドを開いた履歴に依存させると、
 *   開かずに刷ったときだけ番号の列が空で出る。
 * - **注釈**: 画面と同じ番号を振って渡す。紙には吹き出しを出せないので、本文は
 *   刷る側が末尾へまとめる（番号だけが表の中に残る）。
 *
 * 控え行（`#@ hidden`）と行 ID 列は、読み込み（gridDoc）の時点で既に外れている。
 */
import {
  applyComputed,
  readComputedColumns,
  type IdentifiedTsv,
} from '@md-business/schema-test-spec-tsv';
import type { TestSpecTsvPrintDoc, TestSpecTsvPrintRow } from '@md-business/renderer-pdf';
import { placeAnnotations } from './gridAnnot';
import { defaultColAligns } from './gridColumnAlign';
import { defaultColModes } from './gridColumnMode';
import { defaultColWidths } from './gridLayout';
import { DEFAULT_ROW_HEIGHT } from './gridRowLayout';
import { readLayout } from './gridLayoutDirectives';
import { readNotes } from './gridHeaderDirectives';
import { readRowTints, rowTintOf } from './gridStyleDirectives';

/** メタのうち表題として扱うキー（先に見つかったものを採る）。 */
const TITLE_KEYS = ['タイトル', 'Title', 'title'];

/** 組み直しの指定。 */
export interface SheetPrintOptions {
  /** メタに題名が無いときの表題。開いているファイル名を想定。 */
  fallbackTitle: string;
}

/** メタから表題を選び、残りを一覧として返す。 */
function splitTitle(
  meta: Record<string, string>,
  fallbackTitle: string,
): { title: string; rest: Array<{ key: string; value: string }> } {
  const titleKey = TITLE_KEYS.find((key) => (meta[key] ?? '') !== '');
  const rest: Array<{ key: string; value: string }> = [];

  for (const [key, value] of Object.entries(meta)) {
    if (key === titleKey || value === '') continue;
    rest.push({ key, value });
  }

  return { title: titleKey === undefined ? fallbackTitle : meta[titleKey]!, rest };
}

/** グリッドが開いている検証シートを、印刷用の版面データへ組み直す。 */
export function buildSheetPrintDoc(
  doc: IdentifiedTsv,
  options: SheetPrintOptions,
): TestSpecTsvPrintDoc {
  const names = doc.columns.map((column) => column.name);
  const healed = applyComputed(doc, readComputedColumns(doc.directives, names));

  const layout = readLayout(doc.directives, doc.rowIds, {
    colWidths: defaultColWidths(doc.columns),
    colModes: defaultColModes(doc.columns),
    colAligns: defaultColAligns(doc.columns),
    rowHeight: DEFAULT_ROW_HEIGHT,
  });

  const tints = readRowTints(doc.directives, names);
  const rows: TestSpecTsvPrintRow[] = healed.rows.map((cells) => {
    const tint = rowTintOf(tints, cells);
    return tint === undefined ? { cells } : { cells, tint };
  });

  const { title, rest } = splitTitle(doc.meta, options.fallbackTitle);

  return {
    title,
    meta: rest,
    notes: readNotes(doc.directives),
    columns: names.map((name, index) => ({
      name,
      align: layout.colAligns[index],
      width: layout.colWidths[index],
    })),
    rows,
    annotations: placeAnnotations(doc).map((annotation) => ({
      number: annotation.number,
      row: annotation.row,
      col: annotation.col,
      body: annotation.body,
    })),
  };
}
