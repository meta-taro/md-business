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
 * 行を指す手段も同じ考えで、行 ID を持つシートでは **行 ID** で受け取る。行 index は
 * 人が 1 行挿すだけで以降が全部ずれるので、read してから update するまでの間に編集が
 * 入ると、黙って別の行を書き換えることになる。
 *
 * fs には触れず DocumentStore 越しに動くので、純ロジックとして単体テストできる。
 */
import {
  generateRowId,
  hasRowIdColumn,
  isRowId,
  parseTsv,
  serializeTsv,
  validateTsv,
  withRowIds,
  withoutRowIds,
  type IdentifiedTsv,
  type ParsedHeader,
  type TsvDocument,
  type ValidationIssue,
} from '@md-business/schema-test-spec-tsv';
import { safeRelativePath } from './workspacePath.js';
import { withPathLock } from './pathLock.js';
import type { DocumentStore } from './store.js';
import type { ToolError } from './tools.js';

/**
 * 1 セルに書き込める最大文字数。
 *
 * 行の追加 / 更新はファイル全文の読み直し → エスケープ → 書き戻しなので、1 セルの長さが
 * そのまま毎回の処理量とディスク使用量になる。検証シートの備考が数万字になることは無く、
 * 上限を置いてもふつうの記入は届かない。Markdown 側の frontmatter に上限があるのと同じ理由で、
 * スキーマ検証まで到達する前に打ち切る。
 */
export const MAX_TSV_CELL_CHARS = 64_000;

/**
 * 解析を受け付ける TSV 全文の最大文字数。
 *
 * セル上限だけでは行数の伸びを縛れないので、文書全体にも上限を置く。1 万行を超える
 * 検証シートは 1 枚のシートとして扱う想定を外れており、分割したほうが人にも読める。
 */
export const MAX_TSV_SOURCE_CHARS = 4_000_000;

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
  /**
   * `rows` と同じ並びの行 ID。行 ID を持たないシートでは空配列。
   *
   * 空でなければ、update_tsv_row の宛先はこの ID。ID を持たないシートで採番結果を
   * 返さないのは、それがファイルに焼かれていない一時値だからで、次の読み込みでは
   * 別の値になる。渡せば「安定した ID」として使われ、指し先が狂う。
   */
  rowIds: string[];
  /** 列型に照らした違反の一覧（空なら全セル妥当）。 */
  issues: ValidationIssue[];
}

export interface TsvRowOk {
  ok: true;
  path: string;
  /** 追加 / 更新した行の index（`rows` 基準・0 始まり）。 */
  row: number;
  /** その行の ID。行 ID を持たないシートでは付かない。 */
  rowId?: string;
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
  /**
   * 更新対象。行 ID を持つシートでは行 ID、持たないシートでは行 index
   * （`rows` 基準・0 始まり）。
   */
  row: number | string;
  values: TsvRowValues;
}

/** 読み込んだ TSV と、書き戻しに必要な元テキストの体裁。 */
interface LoadedTsv {
  relative: string;
  /** ID 列を抜いた形。ID 列を持たないシートでは素の解析結果と同じ。 */
  doc: IdentifiedTsv;
  /** ID 列がファイルにあるか。無ければ書き戻しでも足さない。 */
  tracksIds: boolean;
  source: string;
}

/**
 * パス検査 → 錠前の取得 → 読み込み・パースまでの共通前段。
 *
 * 読み込みから書き戻しまでを 1 つの錠前の中で行うことで、同じシートへの並行呼び出しが
 * 互いの結果を踏み潰さないようにする（`pathLock` 参照）。読み取りだけの `read_tsv` も
 * 同じ列に並べて、書き込み途中の中間状態を返さないようにする。
 */
async function withLoaded<T>(
  store: DocumentStore,
  requestedPath: string,
  run: (loaded: LoadedTsv) => Promise<T>,
): Promise<T | ToolError> {
  const safe = safeRelativePath(requestedPath);
  if (!safe.ok) return { ok: false, error: safe.reason };
  return withPathLock(safe.relative, async () => {
    const loaded = await load(store, safe.relative);
    if ('ok' in loaded) return loaded;
    return run(loaded);
  });
}

/** 存在確認 → 大きさ検査 → パース。ヘッダが無いファイルはここで弾く。 */
async function load(store: DocumentStore, relative: string): Promise<LoadedTsv | ToolError> {
  if (!(await store.exists(relative))) {
    return { ok: false, error: `ファイルが見つかりません: ${relative}` };
  }
  const source = await store.read(relative);
  if (source.length > MAX_TSV_SOURCE_CHARS) {
    return {
      ok: false,
      error:
        `TSV が大きすぎます: ${relative}` +
        `（${source.length} 文字・上限 ${MAX_TSV_SOURCE_CHARS} 文字。シートを分割してください）`,
    };
  }
  const parsed = parseTsv(source);
  if (parsed.columns.length === 0) {
    return {
      ok: false,
      error: `TSV のヘッダ行が見つかりません: ${relative}（1 行目に型付きヘッダが必要です）`,
    };
  }
  return { relative, doc: withRowIds(parsed), tracksIds: hasRowIdColumn(parsed), source };
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
    if (value.length > MAX_TSV_CELL_CHARS) {
      // 長さだけを返す。値そのものを載せるとエラー応答が同じ大きさで返ってしまう。
      return {
        ok: false,
        error:
          `セルが長すぎます: ${name}` +
          `（${value.length} 文字・上限 ${MAX_TSV_CELL_CHARS} 文字）`,
      };
    }
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

/**
 * 書き出す形に戻す。ID 列を持つシートだけ ID 列を末尾へ書き戻す。
 *
 * 持たないシートへ足すと、触った覚えのない全行が diff に出る。ID 列を焼くのは
 * グリッドで開いて保存したときの仕事で、MCP は受け取った体裁のまま返す。
 */
function toWritable(loaded: LoadedTsv, doc: IdentifiedTsv): TsvDocument {
  if (loaded.tracksIds) return withoutRowIds(doc);
  const { rowIds: _rowIds, idColumn: _idColumn, ...rest } = doc;
  return rest;
}

/** 更新後の文書を書き出し、対象行の検証結果を添えて返す。 */
async function persist(
  store: DocumentStore,
  loaded: LoadedTsv,
  doc: IdentifiedTsv,
  rowIndex: number,
): Promise<TsvRowOk> {
  const next = serializeTsv(toWritable(loaded, doc));
  await store.write(loaded.relative, preserveTrailingEol(next, loaded.source));
  // 検証は ID 列を抜いた形で行う。列 index が read_tsv の columns と揃う。
  const issues = validateTsv(doc);
  const rowId = loaded.tracksIds ? doc.rowIds[rowIndex] : undefined;
  return {
    ok: true,
    path: loaded.relative,
    row: rowIndex,
    ...(rowId === undefined ? {} : { rowId }),
    values: doc.rows[rowIndex] as string[],
    issues: issues.filter((issue) => issue.row === rowIndex),
    totalIssues: issues.length,
  };
}

/**
 * 更新対象の行を決める。
 *
 * ID を持つシートで行 index を受け付けないのは、受け付けると ID がある場面でも
 * index が使われ続け、read から update までの間の挿し込みに黙って壊されるため。
 */
function resolveRow(loaded: LoadedTsv, row: number | string): number | ToolError {
  const { rows, rowIds } = loaded.doc;

  if (loaded.tracksIds) {
    if (typeof row !== 'string' || !isRowId(row)) {
      return {
        ok: false,
        error: `この検証シートは行 ID で行を指定します（受け取った値: ${row}）。read_tsv の rowIds から選んでください`,
      };
    }
    const at = rowIds.indexOf(row);
    if (at < 0) {
      return {
        ok: false,
        error: `行 ID が見つかりません: ${row}（削除された行の可能性があります。read_tsv で取り直してください）`,
      };
    }
    return at;
  }

  if (typeof row === 'string') {
    return {
      ok: false,
      error: `この検証シートは行 ID を持ちません（受け取った値: ${row}）。行 index（0〜${rows.length - 1}）で指定してください`,
    };
  }
  if (!Number.isInteger(row) || row < 0 || row >= rows.length) {
    return { ok: false, error: `行 index が範囲外です: ${row}（データ行は 0〜${rows.length - 1}）` };
  }
  return row;
}

/** 検証シート TSV を読み、ヘッダ・メタ・行と列型の検証結果を返す。 */
export async function readTsv(
  store: DocumentStore,
  requestedPath: string,
): Promise<ReadTsvOk | ToolError> {
  return withLoaded(store, requestedPath, async ({ relative, doc, tracksIds }) => ({
    ok: true as const,
    path: relative,
    formatId: doc.formatId,
    meta: doc.meta,
    directives: doc.directives,
    columns: doc.columns,
    rows: doc.rows,
    rowIds: tracksIds ? [...doc.rowIds] : [],
    issues: validateTsv(doc),
  }));
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
  return withLoaded(store, input.path, async (loaded) => {
    const row = applyValues(loaded.doc.columns, [], input.values);
    if (!Array.isArray(row)) return row;

    const doc: IdentifiedTsv = {
      ...loaded.doc,
      rows: [...loaded.doc.rows, row],
      rowIds: [...loaded.doc.rowIds, generateRowId()],
    };
    return persist(store, loaded, doc, doc.rows.length - 1);
  });
}

/**
 * 既存行のうち、指定された列だけを差し替える（他の列は据え置き）。
 * 空文字を渡せばそのセルを未入力へ戻せる。
 */
export async function updateTsvRow(
  store: DocumentStore,
  input: UpdateTsvRowInput,
): Promise<TsvRowOk | ToolError> {
  return withLoaded(store, input.path, async (loaded) => {
    const at = resolveRow(loaded, input.row);
    if (typeof at !== 'number') return at;

    const { rows } = loaded.doc;
    const row = applyValues(loaded.doc.columns, rows[at] as string[], input.values);
    if (!Array.isArray(row)) return row;

    const nextRows = [...rows];
    nextRows[at] = row;
    return persist(store, loaded, { ...loaded.doc, rows: nextRows }, at);
  });
}
