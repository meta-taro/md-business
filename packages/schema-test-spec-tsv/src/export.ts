/**
 * 提出様式への書き出し（`#@ export <名前> columns=… blank=… newline=…`）。
 *
 * 正本と提出物は形が違う。正本は書きやすさで列を並べ、未入力は空のままにする
 * （`docs/data-cell-conventions.md`）。提出物は先方の様式に従い、列順が決まっていて、
 * 空欄を記号で埋めることを求められ、セル内改行を嫌う。
 *
 * いまは提出のたびに人が貼り付け用を組み直している。組み直しは毎回同じ手順なのに毎回手で
 * やるので、**正本を直したあと提出物を作り直し忘れる**という形でずれる。ずれは提出物の側に
 * しか出ないため、こちらの手元を見ても見つからない。
 *
 * ## 正本は書き換えない
 *
 * 空欄の埋め方（`blank=-`）も改行の畳み方も、**書き出しのときだけ**かかる。ここを崩して
 * 正本に `-` を書き始めると、次に読む人には「何も無い」と「まだ決まっていない」の区別が
 * 付かなくなる。区別が消えたことは後から復元できない。
 *
 * ## 壊れた宣言は宣言ごと捨てる
 *
 * 半端に効いた様式で提出物が出るより、様式が出てこないほうが気づける（`#@ link` /
 * `#@ computed` と同じ判断）。
 *
 * ここは表を組むところまでで、貼り付け・ファイル書き出し・印刷は扱わない。出力先ごとに
 * 事情（引用符・文字コード・改ページ）が違い、混ぜると様式の定義がそれに引きずられる。
 */
import { splitDirectiveOptions } from './directiveOptions.js';
import { escapeCell } from './escape.js';
import type { TsvDocument } from './parse.js';
import { rowIdColumnName } from './rowId.js';

/** ディレクティブの種別語。 */
const EXPORT_DIRECTIVE = 'export';

/** 受け付けるオプション。ここに無いキーが来たら宣言ごと捨てる。 */
const KNOWN_OPTIONS = new Set(['columns', 'blank', 'newline']);

/** 列名の区切り。 */
const COLUMN_SEPARATOR = ',';

/** セル内改行の扱い。 */
export type ExportNewline =
  /** そのまま。表計算へ貼るときはこれでよい（セルの中で折り返る）。 */
  | 'real'
  /** 半角空白に畳む。1 行 1 レコードを崩せない相手へ渡すとき。 */
  | 'space'
  /** 正本と同じバックスラッシュ表記にする。改行があった事実を残したいとき。 */
  | 'escape';

const NEWLINE_MODES = new Set<string>(['real', 'space', 'escape']);

/** 提出様式 1 件。 */
export interface ExportProfile {
  /** 様式の名前。画面で選ぶときの見出しになる。 */
  name: string;
  /** 出す列の位置。並びがそのまま提出物の列順になる。 */
  columns: readonly number[];
  /** 空セルの埋め方。空文字なら埋めない。 */
  blank: string;
  /** セル内改行の扱い。 */
  newline: ExportNewline;
}

/** 書き出した表。見出しとデータ行。 */
export interface ExportTable {
  /** 見出し。型注記（`結果:enum(OK|NG)`）は外れている。 */
  columns: readonly string[];
  /** データ行。長さは `columns` と同じ。 */
  rows: readonly (readonly string[])[];
}

/**
 * ディレクティブ群から提出様式を読む。
 *
 * 名前が無い・知らないオプションがある・列定義に無い列を指している・知らない改行の扱い、
 * のいずれかなら**その宣言を捨てる**。同じ名前が 2 本あれば後勝ち。
 *
 * `columns=` を書かなければ、行 ID 列を除く全列を宣言順で出す。行 ID 列は提出先には
 * 要らない列で、付いていると毎回消される。ただし名前で書いてあれば出す（要ると言って
 * いるのはこちらではない）。
 */
export function readExportProfiles(
  directives: readonly string[],
  columnNames: readonly string[],
): ExportProfile[] {
  const idColumn = rowIdColumnName(directives, columnNames);
  const found = new Map<string, ExportProfile>();

  for (const directive of directives) {
    if (!directive.startsWith(`${EXPORT_DIRECTIVE} `)) continue;
    const profile = parseProfile(
      directive.slice(EXPORT_DIRECTIVE.length + 1).trim(),
      columnNames,
      idColumn,
    );
    if (profile !== null) found.set(profile.name, profile);
  }

  return [...found.values()];
}

/** 名前で様式を引く。無ければ null。 */
export function findExportProfile(
  profiles: readonly ExportProfile[],
  name: string,
): ExportProfile | null {
  return profiles.find((profile) => profile.name === name) ?? null;
}

function parseProfile(
  body: string,
  columnNames: readonly string[],
  idColumn: string | null,
): ExportProfile | null {
  const { head: name, options } = splitDirectiveOptions(body);
  // 名前は 1 語。後ろに素の字が続いていれば、書いたつもりの指定が効いていない。
  if (name === '' || name.search(/\s/) >= 0) return null;

  for (const key of options.keys()) {
    if (!KNOWN_OPTIONS.has(key)) return null;
  }

  const newline = options.get('newline') ?? 'real';
  if (!NEWLINE_MODES.has(newline)) return null;

  const columns = resolveColumns(options.get('columns'), columnNames, idColumn);
  if (columns === null) return null;

  return { name, columns, blank: options.get('blank') ?? '', newline: newline as ExportNewline };
}

/** `columns=` を列の位置へ解く。指定が無ければ既定（行 ID 列以外の全列）。 */
function resolveColumns(
  raw: string | undefined,
  columnNames: readonly string[],
  idColumn: string | null,
): number[] | null {
  if (raw === undefined) {
    return columnNames.map((_, at) => at).filter((at) => columnNames[at]?.trim() !== idColumn);
  }

  const columns: number[] = [];
  for (const name of raw.split(COLUMN_SEPARATOR).map((part) => part.trim())) {
    // 同じ列を 2 回書けば 2 回出す。提出様式が同じ値を 2 列要求することがある。
    const at = columnNames.findIndex((column) => column.trim() === name);
    if (name === '' || at < 0) return null;
    columns.push(at);
  }
  return columns;
}

/**
 * 様式に従って表を組む。**`doc` は書き換えない。**
 *
 * 控え行（`#@ hidden`）を外すかどうかは呼ぶ側が決める。外して渡せば提出物にも出ない。
 */
export function buildExportTable(doc: TsvDocument, profile: ExportProfile): ExportTable {
  const columns = profile.columns.map((at) => doc.columns[at]?.name ?? '');
  const rows = doc.rows.map((cells) =>
    profile.columns.map((at) => renderCell(cells[at] ?? '', profile)),
  );
  return { columns, rows };
}

function renderCell(value: string, profile: ExportProfile): string {
  // 末尾のセルが無い行は空欄と同じ。行の長さの違いを提出物に出さない。
  if (profile.blank !== '' && value.trim() === '') return profile.blank;

  switch (profile.newline) {
    case 'space':
      return value.replace(/\r\n|\r|\n/g, ' ');
    case 'escape':
      return escapeCell(value);
    default:
      return value;
  }
}
