/**
 * 検証シート（カスタム TSV）用の MCP ツール本体。
 * -----------------------------------------------------------------------------
 * Markdown 側の read/create/update と対になる読み書き。検証シートは「人が Sheets で
 * 実施し、結果を 1 行ずつ埋める」使い方が主なので、ファイル全文の差し替えではなく
 * **行単位**（追加 / 更新）で触れるようにする。全文書き換えを避けることで、エージェントが
 * 触っていない行に手が入らず、git diff が実際の変更だけになる。
 *
 * 値は列 index ではなく **列名キー**で受け取る。エージェントは read_tsv で列名を見て
 * そのまま書けるため、列の並び替えに壊されない。
 *
 * fs には触れず DocumentStore 越しに動くので、純ロジックとして単体テストできる。
 */
import {
  parseTsv,
  serializeTsv,
  validateTsv,
  type ParsedHeader,
  type TsvDocument,
  type ValidationIssue,
} from '@md-business/schema-test-spec-tsv';
import { safeRelativePath } from './workspacePath.js';
import type { DocumentStore } from './store.js';
import type { ToolError } from './tools.js';

/** 列名 → セル値。指定しなかった列は追加時なら空、更新時なら据え置き。 */
export type TsvRowValues = Record<string, string>;

export interface ReadTsvOk {
  ok: true;
  /** 正規化済み相対パス。 */
  path: string;
  /** `#!` マジック行のフォーマット識別子（無ければ空文字）。 */
  formatId: string;
  /** `#` メタ行の キー: 値。 */
  meta: Record<string, string>;
  /** `#@` ディレクティブ行（`#@` を剥がした生文字列）。 */
  directives: string[];
  /** 型付きヘッダを解釈した列定義。 */
  columns: ParsedHeader[];
  /** データ行（列順・unescape 済み）。 */
  rows: string[][];
  /** 列型に照らした違反の一覧（空なら全セル妥当）。 */
  issues: ValidationIssue[];
}

export interface TsvRowOk {
  ok: true;
  path: string;
  /** 追加 / 更新した行の index（`rows` 基準・0 始まり）。 */
  row: number;
  /** 書き込み後のその行の値（列順・欠けは空文字で埋めた形）。 */
  values: string[];
  /** **その行の**違反（他行の既存違反は含めない）。 */
  issues: ValidationIssue[];
  /** 文書全体の違反件数（他行に問題が残っているかの目安）。 */
  totalIssues: number;
}

export interface AppendTsvRowInput {
  path: string;
  values: TsvRowValues;
}

export interface UpdateTsvRowInput {
  path: string;
  /** 更新対象の行 index（`rows` 基準・0 始まり）。 */
  row: number;
  values: TsvRowValues;
}

/** 読み込んだ TSV と、書き戻しに必要な元テキストの体裁。 */
interface LoadedTsv {
  relative: string;
  doc: TsvDocument;
  source: string;
}

/** パス検査 → 存在確認 → パースまでの共通前段。ヘッダが無いファイルはここで弾く。 */
async function load(
  store: DocumentStore,
  requestedPath: string,
): Promise<LoadedTsv | ToolError> {
  const safe = safeRelativePath(requestedPath);
  if (!safe.ok) return { ok: false, error: safe.reason };
  if (!(await store.exists(safe.relative))) {
    return { ok: false, error: `ファイルが見つかりません: ${safe.relative}` };
  }
  const source = await store.read(safe.relative);
  const doc = parseTsv(source);
  if (doc.columns.length === 0) {
    return {
      ok: false,
      error: `TSV のヘッダ行が見つかりません: ${safe.relative}（1 行目に型付きヘッダが必要です）`,
    };
  }
  return { relative: safe.relative, doc, source };
}

/**
 * 列名 → 列 index。同名列があるヘッダは、その名前での指定が
 * どちらの列を指すか決められないので、使われた時点で失敗させる（黙って先勝ちにしない）。
 */
function indexColumns(columns: ParsedHeader[]): Map<string, number | 'duplicate'> {
  const map = new Map<string, number | 'duplicate'>();
  columns.forEach((column, index) => {
    map.set(column.name, map.has(column.name) ? 'duplicate' : index);
  });
  return map;
}

/**
 * 列名キーの値を、列順に並べたセル配列へ写す。
 *
 * `base` は更新時の現在値（追加時は空配列）。列数に満たない行は空文字で埋めるので、
 * 末尾の空セルが省略された行を更新しても列位置がずれない。
 */
function applyValues(
  columns: ParsedHeader[],
  base: string[],
  values: TsvRowValues,
): string[] | ToolError {
  const byName = indexColumns(columns);
  const next = columns.map((_, index) => base[index] ?? '');

  for (const [name, value] of Object.entries(values)) {
    const index = byName.get(name);
    if (index === undefined) {
      const known = columns.map((c) => c.name).join(' / ');
      return { ok: false, error: `未知の列名です: ${name}（この TSV の列: ${known}）` };
    }
    if (index === 'duplicate') {
      return {
        ok: false,
        error: `列名が重複しているため列を特定できません: ${name}（ヘッダの列名を一意にしてください）`,
      };
    }
    next[index] = value;
  }
  return next;
}

/**
 * 書き戻しテキストに元テキストの末尾改行の有無を反映する。
 *
 * `serializeTsv` は末尾に改行を付けない契約なので、そのまま書くと保存のたびに
 * 元ファイルの末尾改行が落ち、内容と無関係な 1 行が diff に出てしまう。
 */
function preserveTrailingEol(next: string, prev: string): string {
  if (!prev.endsWith('\n')) return next;
  if (next.endsWith('\n')) return next;
  return `${next}\n`;
}

/** 更新後の文書を書き出し、対象行の検証結果を添えて返す。 */
async function persist(
  store: DocumentStore,
  loaded: LoadedTsv,
  doc: TsvDocument,
  rowIndex: number,
): Promise<TsvRowOk> {
  await store.write(loaded.relative, preserveTrailingEol(serializeTsv(doc), loaded.source));
  const issues = validateTsv(doc);
  return {
    ok: true,
    path: loaded.relative,
    row: rowIndex,
    values: doc.rows[rowIndex] as string[],
    issues: issues.filter((issue) => issue.row === rowIndex),
    totalIssues: issues.length,
  };
}

/** 検証シート TSV を読み、ヘッダ・メタ・行と列型の検証結果を返す。 */
export async function readTsv(
  store: DocumentStore,
  requestedPath: string,
): Promise<ReadTsvOk | ToolError> {
  const loaded = await load(store, requestedPath);
  if ('ok' in loaded) return loaded;
  const { doc } = loaded;
  return {
    ok: true,
    path: loaded.relative,
    formatId: doc.formatId,
    meta: doc.meta,
    directives: doc.directives,
    columns: doc.columns,
    rows: doc.rows,
    issues: validateTsv(doc),
  };
}

/**
 * 末尾へ 1 行追加する。指定の無い列は空セル（＝未入力の正本表現）のまま残す。
 *
 * 列型に反する値でも書き込んだうえで `issues` に載せる。検証シートは記入途中の状態が
 * 普通にあり、書き込み自体を拒むと「後で直す」運用ができなくなるため。
 */
export async function appendTsvRow(
  store: DocumentStore,
  input: AppendTsvRowInput,
): Promise<TsvRowOk | ToolError> {
  const loaded = await load(store, input.path);
  if ('ok' in loaded) return loaded;

  const row = applyValues(loaded.doc.columns, [], input.values);
  if (!Array.isArray(row)) return row;

  const doc: TsvDocument = { ...loaded.doc, rows: [...loaded.doc.rows, row] };
  return persist(store, loaded, doc, doc.rows.length - 1);
}

/**
 * 既存行のうち、指定された列だけを差し替える（他の列は据え置き）。
 * 空文字を渡せばそのセルを未入力へ戻せる。
 */
export async function updateTsvRow(
  store: DocumentStore,
  input: UpdateTsvRowInput,
): Promise<TsvRowOk | ToolError> {
  const loaded = await load(store, input.path);
  if ('ok' in loaded) return loaded;

  const { rows } = loaded.doc;
  if (!Number.isInteger(input.row) || input.row < 0 || input.row >= rows.length) {
    return {
      ok: false,
      error: `行 index が範囲外です: ${input.row}（データ行は 0〜${rows.length - 1}）`,
    };
  }

  const row = applyValues(loaded.doc.columns, rows[input.row] as string[], input.values);
  if (!Array.isArray(row)) return row;

  const nextRows = [...rows];
  nextRows[input.row] = row;
  return persist(store, loaded, { ...loaded.doc, rows: nextRows }, input.row);
}
