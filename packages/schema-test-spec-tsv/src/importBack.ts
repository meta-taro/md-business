/**
 * 提出物を正本へ戻す（`#@ export … key=<列名>` の逆向き）。
 *
 * 出す口だけがあると、先方が提出物の側に書き込んだ結果を人が目で写すことになる。写し漏れは
 * 提出物の側にしか出ないので、こちらの手元をいくら見ても見つからない。
 *
 * ## 位置では当てない
 *
 * 提出物は先方の手元にある間に並べ替えられ、行が挿され、いらない行が消される。返ってきた表の
 * 「何行目か」は出したときの何行目かと関係が無い。だから当てるのは宣言されたキー列だけで、
 * キー列を出していない様式は戻せない（`key=` の無い様式は出せるが戻せない）。
 *
 * ## 足さない・消さない
 *
 * ここがするのは既にある行のセルを直すことだけ。正本に無いキーは報告して終わりにする。
 * 先方が足した行をそのまま取り込むと、正本の採番・行 ID・計算列の前提が同時に崩れる。
 *
 * ## 変わったセルだけ
 *
 * 提出してから返ってくるまでの間に、こちらでも正本を直している。全セルを書き戻すと、その直しが
 * 黙って古い値へ戻る。差し戻すのは値が実際に違うセルだけにする。
 *
 * ここは計画を組むところまでで、書き込みは行わない。何件変わるのか・どのキーが当たらなかったのかを
 * 人が見てから当てる、という順序を崩さないため。
 */
import { lockedColumns, readComputedColumns } from './computed.js';
import { unescapeCell } from './escape.js';
import type { ExportProfile } from './export.js';
import type { TsvDocument } from './parse.js';
import { rowIdColumnName } from './rowId.js';

/** 取り込みを断る理由。 */
export type ImportBackRejection =
  /** 様式に `key=` が無い。当てる手段が無いので、位置で当てにいかず断る。 */
  | 'no-key'
  /** `newline=space` の様式。畳んだ改行は戻せない（下記 {@link planImportBack}）。 */
  | 'folded-newline'
  /** 貼り付けられた表の見出しにキー列が無い。別の様式の表を貼っている。 */
  | 'no-key-column';

/** 差し戻す 1 セル。 */
export interface ImportBackChange {
  /** 正本の行の位置（`doc.rows` の添字）。 */
  row: number;
  /** 正本の列の位置（`doc.columns` の添字）。 */
  column: number;
  /** いまの値。 */
  before: string;
  /** 戻ってきた値。 */
  after: string;
}

/**
 * 取り込みの計画。**変更と、当たらなかったものの両方**を返す。
 *
 * 「0 件変わります」とだけ出すと「もう全部入っている」と読めてしまい、キーが 1 つも当たって
 * いないことに気づけない。当たらなかった側を必ず一緒に出す。
 */
export interface ImportBackPlan {
  /** 差し戻すセル。空なら当てるものが無い。 */
  changes: readonly ImportBackChange[];
  /** 提出物にあって正本に無いキー。行は足さないので報告だけ。 */
  unknownKeys: readonly string[];
  /** どちらかの側で 2 回出たキー。どの行のことか決められないので触らない。 */
  duplicateKeys: readonly string[];
  /** 様式が出しているのに、貼り付けられた見出しに無かった列。 */
  missingColumns: readonly string[];
  /** 見出しにあるが書かない列（計算列・行 ID 列・提出物に 2 回出ている列）。 */
  lockedColumns: readonly string[];
  /** キーが空で当てられなかった提出物の行数。 */
  skipped: number;
  /** 取り込めない場合の理由。null 以外なら他はすべて空。 */
  rejected: ImportBackRejection | null;
}

/** 書き戻す先が決まった 1 列。 */
interface Writable {
  /** 貼り付けられた表での位置。 */
  at: number;
  /** 正本での列の位置。 */
  column: number;
}

function rejectedPlan(reason: ImportBackRejection): ImportBackPlan {
  return {
    changes: [],
    unknownKeys: [],
    duplicateKeys: [],
    missingColumns: [],
    lockedColumns: [],
    skipped: 0,
    rejected: reason,
  };
}

/** 出したときの見た目を正本の値へ戻す。空欄の埋めを先に外してから改行を戻す。 */
function decodeCell(value: string, profile: ExportProfile): string {
  if (profile.blank !== '' && value.trim() === profile.blank) return '';
  return profile.newline === 'escape' ? unescapeCell(value) : value;
}

/** 2 回以上出た値を、最初に出た順で返す。 */
function repeated(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const twice = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) twice.add(value);
    seen.add(value);
  }
  return [...twice];
}

/**
 * 提出様式で出した表を、正本へ戻す計画にする。
 *
 * `pasted` は見出し 1 行 + データ行（`buildExportTable` が組む形と同じ）。
 *
 * `newline=space` の様式は取り込まない。空白へ畳んだ改行は、もともと打たれていた空白と
 * 区別が付かない。取り込めば、先方が触っていないセルからも改行が消える。
 */
export function planImportBack(
  doc: TsvDocument,
  profile: ExportProfile,
  pasted: readonly (readonly string[])[],
): ImportBackPlan {
  if (profile.key === null) return rejectedPlan('no-key');
  if (profile.newline === 'space') return rejectedPlan('folded-newline');

  const header = pasted[0];
  if (header === undefined) return rejectedPlan('no-key-column');

  const keyAt = header.findIndex((cell) => cell.trim() === profile.key);
  if (keyAt < 0) return rejectedPlan('no-key-column');

  const columnNames = doc.columns.map((column) => column.name);
  const keyColumn = columnNames.findIndex((name) => name.trim() === profile.key);
  if (keyColumn < 0) return rejectedPlan('no-key-column');

  // 書かない列。計算列は次の再計算で消えるし、行 ID 列はその行が誰であるかそのものなので、
  // どちらも提出物の側の値で上書きしてよいものではない。
  const locked = new Set(lockedColumns(readComputedColumns(doc.directives, columnNames)));
  const idColumn = rowIdColumnName(doc.directives, columnNames);
  if (idColumn !== null) {
    const at = columnNames.findIndex((name) => name.trim() === idColumn);
    if (at >= 0) locked.add(at);
  }

  // 様式が出す列だけを見る。見出しに余計な列が足されていても、様式の外の列は触らない。
  const emitted = new Set(profile.columns.map((at) => columnNames[at]?.trim() ?? ''));
  const headerNames = header.map((cell) => cell.trim());
  // 同じ列が 2 回出ている様式がある。片方だけ直された表が返ってきたとき、どちらが本当かは
  // こちらでは決められない。
  const twice = new Set(repeated(headerNames.filter((name) => emitted.has(name))));

  const writable: Writable[] = [];
  const blocked: string[] = [];
  for (const [at, name] of headerNames.entries()) {
    // キー列は行の識別そのもの。当てるために使った値を、その行へ書き戻さない。
    if (!emitted.has(name) || name === profile.key) continue;

    const column = columnNames.findIndex((candidate) => candidate.trim() === name);
    if (column < 0) continue;

    if (twice.has(name) || locked.has(column)) {
      if (!blocked.includes(name)) blocked.push(name);
      continue;
    }
    writable.push({ at, column });
  }

  const present = new Set(headerNames);
  const missingColumns: string[] = [];
  for (const at of profile.columns) {
    const name = columnNames[at]?.trim() ?? '';
    if (name === profile.key || locked.has(at)) continue;
    if (!present.has(name) && !missingColumns.includes(name)) missingColumns.push(name);
  }

  const rowsByKey = new Map<string, number[]>();
  for (const [row, cells] of doc.rows.entries()) {
    const key = (cells[keyColumn] ?? '').trim();
    if (key === '') continue;
    const found = rowsByKey.get(key);
    if (found === undefined) rowsByKey.set(key, [row]);
    else found.push(row);
  }

  const body = pasted.slice(1);
  const pastedTwice = new Set(
    repeated(body.map((cells) => (cells[keyAt] ?? '').trim()).filter((key) => key !== '')),
  );

  const changes: ImportBackChange[] = [];
  const unknownKeys: string[] = [];
  const duplicateKeys: string[] = [];
  let skipped = 0;

  for (const cells of body) {
    const key = (cells[keyAt] ?? '').trim();
    if (key === '') {
      skipped += 1;
      continue;
    }

    const rows = rowsByKey.get(key);
    if (pastedTwice.has(key) || (rows !== undefined && rows.length > 1)) {
      if (!duplicateKeys.includes(key)) duplicateKeys.push(key);
      continue;
    }
    const row = rows?.[0];
    if (row === undefined) {
      if (!unknownKeys.includes(key)) unknownKeys.push(key);
      continue;
    }

    for (const target of writable) {
      const after = decodeCell(cells[target.at] ?? '', profile);
      const before = doc.rows[row]?.[target.column] ?? '';
      if (after !== before) changes.push({ row, column: target.column, before, after });
    }
  }

  return {
    changes,
    unknownKeys,
    duplicateKeys,
    missingColumns,
    lockedColumns: blocked,
    skipped,
    rejected: null,
  };
}
