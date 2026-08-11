/**
 * JSON / XML の繰り返し構造を Markdown の表にする。
 * -----------------------------------------------------------------------------
 * read_data は木を返すので、明細のような並びを表にするにはエージェントが木を降りて
 * 自分で組み立てることになる。その過程で列が抜ける・順序が変わる・`|` で表が壊れるといった
 * 事故が起きやすく、しかも壊れた表は「読める形」をしているので気づかれにくい。
 * 表への写し取りだけをこちらで固定し、決まりをテストで押さえる。
 *
 * 写せなかったものは黙って落とさない。入れ子の項目・同名が重なった項目・上限で切った行は、
 * それぞれ件数か名前を返す。表に出ないものが分かっていれば、続きは read_data で取りに行ける。
 */
import { readDataFile, type DataFormat, type DataTreeNode } from '@md-business/data-tree';
import { safeRelativePath } from './workspacePath.js';
import { describeAt, describeProblem, resolveAt } from './dataTools.js';
import type { DocumentStore } from './store.js';
import type { ToolError } from './tools.js';

/** 既定の行数上限。1 回の応答に収まる範囲を優先する（続きは at と limit で取り直せる）。 */
export const DATA_TABLE_DEFAULT_LIMIT = 200;

/** 値だけが並ぶ配列を表にしたときの列名。名前を持たない値の置き場所。 */
const VALUE_COLUMN = '値';

export interface DataToTableOptions {
  /**
   * 表にする並びの親。省略すると根。
   * 指した節の**子が 1 行ずつ**になる（`{"明細":[…]}` なら `at: ["明細"]`）。
   */
  at?: string[];
  /** 載せる行数の上限。省略時は 200。 */
  limit?: number;
}

export interface DataToTableOk {
  ok: true;
  path: string;
  format: DataFormat;
  /** 実際に表にした位置（根なら空）。 */
  at: string[];
  /** 左から並べた列名。XML の属性は `@名前`。 */
  columns: string[];
  /** 表に載せた行数。 */
  rowCount: number;
  /** 元の行数。 */
  totalRows: number;
  /** 上限で載せなかった行数（切っていなければ 0）。 */
  truncated: number;
  /** さらに子を持つため列にしなかった項目の名前。 */
  nestedColumns: string[];
  /** 1 行の中で複数現れ、先頭だけを載せた項目の名前。 */
  multiValuedColumns: string[];
  /** 出典行を含む Markdown。 */
  markdown: string;
}

/**
 * セル 1 個ぶんの文字列に直す。
 *
 * `|` は退避しないと列が増えて表がずれる。改行とタブは、表の 1 行が複数行に割れるのを防ぐため
 * 空白へ畳む（Markdown の表はセル内改行を持てない）。値そのものは変えたくないので、
 * 連続する空白は詰めない。
 */
function toCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/[\r\n\t]+/g, ' ');
}

function row(cells: string[]): string {
  return `| ${cells.join(' | ')} |`;
}

/** 1 行ぶんの節から「列名 → 値」を取り出す。列にできなかったものは呼び出し側へ報告する。 */
interface RowCells {
  values: Map<string, string>;
  nested: string[];
  multi: string[];
}

function cellsOf(node: DataTreeNode): RowCells {
  const values = new Map<string, string>();
  const nested: string[] = [];
  const multi: string[] = [];

  for (const attr of node.attributes ?? []) {
    const key = `@${attr.name}`;
    if (values.has(key)) multi.push(key);
    else values.set(key, attr.value);
  }

  // 子を持たない節は、その値そのものが 1 セル（スカラーの並び）。
  if (node.children.length === 0) {
    if (node.value !== undefined) values.set(VALUE_COLUMN, node.value);
    return { values, nested, multi };
  }

  for (const child of node.children) {
    // 孫がいる項目はセル 1 個に収まらない。名前だけ挙げて、中身は read_data に任せる。
    if (child.children.length > 0) {
      if (!nested.includes(child.name)) nested.push(child.name);
      continue;
    }
    if (values.has(child.name)) {
      if (!multi.includes(child.name)) multi.push(child.name);
      continue;
    }
    values.set(child.name, child.value ?? '');
  }
  return { values, nested, multi };
}

/**
 * ワークスペースの JSON / XML の繰り返し構造を Markdown の表にする。
 *
 * 列は行に現れた順の和で、その行に無い項目は空セルのままにする（未入力を `—` や `N/A` で
 * 埋めない、という表記の決まりに合わせる）。
 */
export async function dataToTable(
  store: DocumentStore,
  requestedPath: string,
  options: DataToTableOptions = {},
): Promise<DataToTableOk | ToolError> {
  const safe = safeRelativePath(requestedPath);
  if (!safe.ok) return { ok: false, error: safe.reason };
  if (!(await store.exists(safe.relative))) {
    return { ok: false, error: `ファイルが見つかりません: ${safe.relative}` };
  }
  const src = await store.read(safe.relative);
  const result = readDataFile(safe.relative, src);
  if (!result.ok) return { ok: false, error: describeProblem(result.problem) };

  const limit = options.limit ?? DATA_TABLE_DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1) {
    return { ok: false, error: `limit は 1 以上の整数で指定してください: ${String(options.limit)}` };
  }

  const at = options.at ?? [];
  const found = resolveAt(result.root, at);
  if (!found.ok) return found;

  const source = found.node;
  if (source.children.length === 0) {
    return {
      ok: false,
      error: `${describeAt(at)} に行になる子がありません。繰り返しの親（配列や同名要素の並び）を at で指してください。`,
    };
  }

  const totalRows = source.children.length;
  const shown = source.children.slice(0, limit);

  const columns: string[] = [];
  const nestedColumns: string[] = [];
  const multiValuedColumns: string[] = [];
  const rows: Map<string, string>[] = [];

  for (const child of shown) {
    const { values, nested, multi } = cellsOf(child);
    for (const name of values.keys()) if (!columns.includes(name)) columns.push(name);
    for (const name of nested) if (!nestedColumns.includes(name)) nestedColumns.push(name);
    for (const name of multi) if (!multiValuedColumns.includes(name)) multiValuedColumns.push(name);
    rows.push(values);
  }

  const truncated = totalRows - shown.length;
  const where = at.length > 0 ? at.join('/') : source.name || '根';
  const lines = [
    `> 出典: ${safe.relative} の ${where}`,
    '',
    row(columns.map(toCell)),
    row(columns.map(() => '---')),
    ...rows.map((values) => row(columns.map((name) => toCell(values.get(name) ?? '')))),
  ];
  if (truncated > 0) {
    lines.push('', `> ほか ${truncated} 行は載せていません（上限 ${limit} 行）`);
  }

  return {
    ok: true,
    path: safe.relative,
    format: result.format,
    at,
    columns,
    rowCount: rows.length,
    totalRows,
    truncated,
    nestedColumns,
    multiValuedColumns,
    markdown: lines.join('\n'),
  };
}
