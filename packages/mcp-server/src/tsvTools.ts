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
  applyComputed,
  checkColumnLink,
  collectEnumChoices,
  countReferences,
  generateRowId,
  hasRowIdColumn,
  isRowId,
  lockedColumns,
  mergeHiddenRows,
  parseTsv,
  readColumnLinks,
  readComputedColumns,
  serializeTsv,
  splitHiddenRows,
  validateTsv,
  withRowIds,
  withoutRowIds,
  type ComputedColumn,
  type ComputedCounts,
  type EnumChoices,
  type HiddenRow,
  type ColumnLink,
  type IdentifiedTsv,
  type LinkIssue,
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

/**
 * リンク照合の結果 1 件。参照先の位置は相手ファイルの中なので、どのファイルかを添える。
 *
 * `side` が `target` の行はこのシートには無い。パスが無いと、受け取った側は
 * 「取りこぼしがある」ことは分かっても、どこを開けば直せるのかが分からない。
 */
export interface TsvLinkIssue extends LinkIssue {
  /** 参照先ファイルの正規化相対パス。 */
  targetPath: string;
}

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
  /**
   * リンク定義（`#@ link`）の両方向照合の結果。定義が無ければ空配列。
   *
   * `issues` と分けるのは、こちらが**他のファイルを読んだ結果**だから。参照先を開いて
   * いなければ照合できない（＝空でも「問題なし」を意味しない）ので、同じ配列に混ぜると
   * 受け取った側が判断を誤る。
   */
  linkIssues: TsvLinkIssue[];
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
  /** ID 列と控え行を抜いた形。ID 列を持たないシートでは素の解析結果と同じ。 */
  doc: IdentifiedTsv;
  /** ID 列がファイルにあるか。無ければ書き戻しでも足さない。 */
  tracksIds: boolean;
  /** 表から外した控え行。書き戻しで元の位置へ戻す。 */
  hidden: HiddenRow[];
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
  // 控えは行 ID で指すので、ID が出そろってから外す。外してしまえば行の指定・検証は
  // 控えを知らずに済み、表に出ていない行を書き換える手立ても無くなる。
  const { doc, hidden } = splitHiddenRows(withRowIds(parsed));
  return { relative, doc, tracksIds: hasRowIdColumn(parsed), hidden, source };
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
  locked: ReadonlySet<number>,
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
    if (locked.has(index)) {
      // 黙って落とすと、埋めたつもりのまま完了報告される。書き込み自体を失敗させる。
      return {
        ok: false,
        error: `計算列には書き込めません: ${name}（値はシートの宣言から決まります）`,
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
 * 書き出す形に戻す。控え行を元の位置へ戻し、ID 列を持つシートだけ ID 列を末尾へ書き戻す。
 *
 * ID 列を持たないシートへ足すと、触った覚えのない全行が diff に出る。ID 列を焼くのは
 * グリッドで開いて保存したときの仕事で、MCP は受け取った体裁のまま返す。
 */
function toWritable(loaded: LoadedTsv, doc: IdentifiedTsv): TsvDocument {
  const merged = mergeHiddenRows(doc, loaded.hidden);
  if (loaded.tracksIds) return withoutRowIds(merged);
  const { rowIds: _rowIds, idColumn: _idColumn, ...rest } = merged;
  return rest;
}

/**
 * そのシートの計算列（`#@ computed <列名> = <式>`）。
 *
 * 値がほかから決まる列は、人にも AI にも打たせない。**アプリのグリッドだけを塞いでも
 * ここから同じことができる**（事故は人の指示で AI が集計列を潰した経路で起きた）。
 */
function computedOf(doc: TsvDocument): ComputedColumn[] {
  return readComputedColumns(
    doc.directives,
    doc.columns.map((column) => column.name),
  );
}

/**
 * 参照先パスを、そのシートのある場所からの相対として解決する。
 *
 * ワークスペースのルート基準にしないのは、シートに書く側が自分の隣のファイルを
 * `観点.tsv` と書けるようにするため。深い場所へ置き直したときにルート基準の記述が
 * 全部壊れる、という直し方も避けられる。
 */
function resolveLinkPath(sourceRelative: string, target: string): string | null {
  const slash = sourceRelative.lastIndexOf('/');
  const dir = slash < 0 ? '' : sourceRelative.slice(0, slash);
  const safe = safeRelativePath(dir === '' ? target : `${dir}/${target}`);
  return safe.ok ? safe.relative : null;
}

/**
 * そのシートのリンク定義（`#@ link <列名> -> <ファイル>#<列名>`）を両方向に照合する。
 *
 * 参照先が読めない・壊れているときは、その 1 本だけを警告にして残りを続ける。
 * ワークスペースの一部だけを開いていることがあり、そこで全部止めると
 * 「開くたびに赤い」状態になって本物の欠落が埋もれる。
 */
async function linkIssuesOf(
  store: DocumentStore,
  sourceRelative: string,
  doc: TsvDocument,
): Promise<TsvLinkIssue[]> {
  const links: ColumnLink[] = readColumnLinks(
    doc.directives,
    doc.columns.map((column) => column.name),
  );
  const issues: TsvLinkIssue[] = [];

  for (const link of links) {
    const targetPath = resolveLinkPath(sourceRelative, link.path);
    const loaded = targetPath === null ? null : await load(store, targetPath);
    const target = loaded !== null && !('ok' in loaded) ? loaded.doc : null;
    for (const issue of checkColumnLink(doc, link, target)) {
      issues.push({ ...issue, targetPath: targetPath ?? link.path });
    }
  }

  return issues;
}

/**
 * 集計列（`#@ computed <列名> = countIn(<ファイル>)`）を数える。
 *
 * 数える相手を読めない・相手がこちらを指していないときは、その列を結果に載せない
 * （＝セルに触らない）。0 を書くと「参照が 1 件も無い」と区別がつかず、
 * 開いていないだけの状態が件数としてファイルへ焼かれる。
 */
async function countsOf(
  store: DocumentStore,
  sourceRelative: string,
  doc: TsvDocument,
  computed: readonly ComputedColumn[],
): Promise<ComputedCounts> {
  const counts = new Map<number, readonly number[]>();

  for (const column of computed) {
    if (column.formula !== 'countIn' || column.source === undefined) continue;

    const otherPath = resolveLinkPath(sourceRelative, column.source);
    if (otherPath === null) continue;
    const loaded = await load(store, otherPath);
    if ('ok' in loaded) continue;

    const counted = countReferences(doc, sourceRelative, loaded.doc, otherPath);
    if (counted !== null) counts.set(column.columnIndex, counted);
  }

  return counts;
}

/**
 * 選択肢を別シートから引く列（`enum(-> <ファイル>#<列名>)`）の選択肢を集める。
 *
 * 引けなかった列は結果に載せない（＝その列の選択肢検査を飛ばす）。空の選択肢として
 * 扱うと、参照先を開いていないだけで既存の値が一斉に不正になる。
 */
async function choicesOf(
  store: DocumentStore,
  sourceRelative: string,
  doc: TsvDocument,
): Promise<EnumChoices> {
  const choices = new Map<number, readonly string[]>();

  for (const [index, column] of doc.columns.entries()) {
    const source = column.enumSource;
    if (source === undefined) continue;

    const otherPath = resolveLinkPath(sourceRelative, source.path);
    if (otherPath === null) continue;
    const loaded = await load(store, otherPath);
    if ('ok' in loaded) continue;

    const collected = collectEnumChoices(loaded.doc, source.column);
    if (collected !== null) choices.set(index, collected);
  }

  return choices;
}

/**
 * 更新後の文書を書き出し、対象行の検証結果を添えて返す。
 *
 * 計算列はここで算出値へ揃える。**触った行だけでなく列ごと**直すのは、行の追加・削除で
 * 番号が飛んだ状態が塞いだ後に残る唯一の壊れ方で、1 行ずつでは直せないため。
 * 書き込み経路ごとに揃えると、経路が増えたときに漏れる。
 */
async function persist(
  store: DocumentStore,
  loaded: LoadedTsv,
  doc: IdentifiedTsv,
  rowIndex: number,
): Promise<TsvRowOk> {
  const computed = computedOf(doc);
  const healed = applyComputed(doc, computed, await countsOf(store, loaded.relative, doc, computed));
  const next = serializeTsv(toWritable(loaded, healed));
  await store.write(loaded.relative, preserveTrailingEol(next, loaded.source));
  // 検証は ID 列を抜いた形で行う。列 index が read_tsv の columns と揃う。
  const issues = validateTsv(healed, await choicesOf(store, loaded.relative, healed));
  const rowId = loaded.tracksIds ? healed.rowIds[rowIndex] : undefined;
  return {
    ok: true,
    path: loaded.relative,
    row: rowIndex,
    ...(rowId === undefined ? {} : { rowId }),
    values: healed.rows[rowIndex] as string[],
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
    issues: validateTsv(doc, await choicesOf(store, relative, doc)),
    linkIssues: await linkIssuesOf(store, relative, doc),
  }));
}

/** 検査だけをした 1 枚ぶんの結果。何も無いシートは載せないので、載っている＝何かある。 */
export interface TsvCheckSheet {
  /** 正規化済み相対パス。 */
  path: string;
  /** 読めなかった理由。読めたときは付かない。 */
  error?: string;
  /** データ行の数（読めたときだけ）。 */
  rows?: number;
  /** 列型・割れた行の検査結果。 */
  issues: ValidationIssue[];
  /** 別シートを指す列（`#@ link`）の照合結果。 */
  linkIssues: TsvLinkIssue[];
  /** 件数の上限で切ったか。 */
  truncated?: boolean;
}

export interface CheckTsvOk {
  ok: true;
  /** 見たシートの枚数。 */
  checked: number;
  /** 何か見つかったシートだけ。 */
  sheets: TsvCheckSheet[];
  /** 見つかった件数の合計（上限で切る前の数）。 */
  totalIssues: number;
}

export interface CheckTsvInput {
  /** 見るシート。省略するとワークスペースの `.tsv` を全部見る。 */
  path?: string;
}

/**
 * 1 枚あたりに返す件数の上限。
 *
 * 列を 1 つ増やし忘れただけで全行が違反になることがある。全部返すと読む側の文脈が
 * 1 枚で埋まり、残りのシートを見る前に打ち切られる。切ったことは `truncated` で言う。
 */
export const MAX_CHECK_ISSUES_PER_SHEET = 50;

/**
 * 書き込まずに検査だけする。
 *
 * read_tsv でも検査結果は返るが、あれは中身を読む口なので行を全部連れてくる。
 * 「どこか壊れていないか」を見たいだけのときに全シートぶんの行を運ぶと、調べる前に
 * 読む側が埋まる。**壊れた場所だけを返す口**を別に立てて、行は返さない。
 *
 * 検査だけなので**直しもしない**。割れた行を機械で繋ぐと、割れ目がセルの途中だったのか
 * 元から別の行だったのかを取り違えたときに、直した跡が残らないまま中身が変わる。
 */
export async function checkTsv(
  store: DocumentStore,
  input: CheckTsvInput,
): Promise<CheckTsvOk | ToolError> {
  let targets: string[];
  if (input.path === undefined) {
    targets = await store.listSheets();
  } else {
    const safe = safeRelativePath(input.path);
    if (!safe.ok) return { ok: false, error: safe.reason };
    if (!(await store.exists(safe.relative))) {
      return { ok: false, error: `ファイルが見つかりません: ${safe.relative}` };
    }
    targets = [safe.relative];
  }

  const sheets: TsvCheckSheet[] = [];
  let totalIssues = 0;

  for (const relative of targets) {
    const loaded = await load(store, relative);
    if ('ok' in loaded) {
      // 1 枚読めなくても残りは見る。まとめて直せるように、全部の結果を一度に返す。
      sheets.push({ path: relative, error: loaded.error, issues: [], linkIssues: [] });
      continue;
    }

    const issues = validateTsv(loaded.doc, await choicesOf(store, relative, loaded.doc));
    const linkIssues = await linkIssuesOf(store, relative, loaded.doc);
    totalIssues += issues.length + linkIssues.length;
    if (issues.length === 0 && linkIssues.length === 0) continue;

    const kept = issues.slice(0, MAX_CHECK_ISSUES_PER_SHEET);
    sheets.push({
      path: relative,
      rows: loaded.doc.rows.length,
      issues: kept,
      linkIssues,
      ...(kept.length < issues.length ? { truncated: true } : {}),
    });
  }

  return { ok: true, checked: targets.length, sheets, totalIssues };
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
    const row = applyValues(
      loaded.doc.columns,
      [],
      input.values,
      lockedColumns(computedOf(loaded.doc)),
    );
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
    const row = applyValues(
      loaded.doc.columns,
      rows[at] as string[],
      input.values,
      lockedColumns(computedOf(loaded.doc)),
    );
    if (!Array.isArray(row)) return row;

    const nextRows = [...rows];
    nextRows[at] = row;
    return persist(store, loaded, { ...loaded.doc, rows: nextRows }, at);
  });
}
