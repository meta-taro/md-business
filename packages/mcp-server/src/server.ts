/**
 * MCP サーバー本体。
 * -----------------------------------------------------------------------------
 * 検証済みのツール関数（read/validate/create/update/search）+ レジストリを MCP の
 * registerTool へ配線するだけの薄い層。ロジックは各ツール関数側に閉じており、ここは
 * 「zod で入力を宣言 → ツール関数を呼ぶ → JSON テキストで返す」に徹する。
 * DocumentStore を引数で受けるので、テストは InMemoryTransport + MemoryDocumentStore、
 * 本番は StdioServerTransport + FileDocumentStore（bin.ts）に差し替えられる。
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { DocumentStore } from './store.js';
import { listSchemas, getSchemaDefinition } from './registry.js';
import {
  readDocument,
  validateDocument,
  createDocument,
  updateDocument,
} from './tools.js';
import type { UpdateDocumentInput } from './tools.js';
import { readTsv, checkTsv, appendTsvRow, updateTsvRow } from './tsvTools.js';
import { readData, type ReadDataOptions } from './dataTools.js';
import { dataToTable, type DataToTableOptions } from './dataToTable.js';
import { readHar, type ReadHarInput } from './harTools.js';
import { searchLines, readLines, type SearchLinesInput, type ReadLinesInput } from './logTools.js';
import { filterRecords, type FilterRecordsInput, type Condition } from './records.js';
import { aggregate, type AggregateInput } from './aggregate.js';
import { buildTimeline, type BuildTimelineInput, type TimelineSource } from './timeline.js';
import { saveEvidence, type SaveEvidenceInput } from './evidence.js';
import { searchDocuments } from './search.js';
import type { SearchQuery } from './search.js';
import { gitStatus, gitDiff, gitCommit } from './gitTools.js';
import type { GitCommitInput, GitRunner } from './gitTools.js';
import type { AppBridge } from './appBridge.js';
import type { DesktopOpener } from './desktopOpener.js';
import { safeRelativePath } from './workspacePath.js';
import { parseProjectConfig, PROJECT_CONFIG_FILENAME } from '@md-business/core';
import {
  describeWebMode,
  parseTrustAnswer,
  planDeclareWebMode,
  declareSummary,
  WEB_MODE_DECLARATION_TEXT,
} from './webMode.js';
import { readSiteFile, writeSiteFile } from './siteFiles.js';
import { buildToolLogEntry, type ToolLogEntry, type ToolResultLike } from './toolLog.js';

/** MCP クライアントへ提示するサーバー名 / バージョン（プロトコル上の識別子）。 */
export const SERVER_NAME = 'md-business';
export const SERVER_VERSION = '0.1.0';

/**
 * initialize で返す、このサーバーの使いどころ。
 *
 * ツール個別の description は「そのツールが何をするか」しか言えず、「素のファイル編集ではなく
 * こちらを使う」は表明できない。AI クライアントは汎用の読み書き手段を常に持っており、そちらは
 * 確実に動くので、この欄が空だと業務文書まで素のファイル編集で触られる。結果としてスキーマ検証も
 * 画面反映も操作ログも素通りする（実運用で発生した）。ここはその唯一の伝達口なので、
 * 「何をしないか」「代わりに何を呼ぶか」「なぜか」の 3 点を必ず含める。
 *
 * 長くすると読まれないため、入口のツールと守ってほしい一線だけに絞る。個々の使い方は
 * ツールの description が持つ。
 */
export const SERVER_INSTRUCTIONS = `md-business は Markdown / TSV の業務文書（請求書・基本設計書・API 仕様書・DB 設計書・検証シート）を扱うワークスペースに接続されている。

## このワークスペースの .md / .tsv は直接編集しない

汎用のファイル読み書きでも書き換えられるが、そうすると次の 3 つが失われる。

- **スキーマ検証**: 業務文書は JSON Schema に従う。素の編集では壊れたまま気づけない。
- **画面反映**: 利用者はデスクトップアプリで同じファイルを開いている。ツール経由の書き込みだけが即座に画面へ出る。
- **操作ログ**: AI が何を触ったかは MCP タブに残る。素の編集は記録されず、利用者から追えない。

## どのツールを呼ぶか

- 最初に **search_documents** でワークスペースにある文書を把握する。**list_schemas** で扱える種別が分かる。
- Markdown を読むのは **read_document**、書くのは **create_document** / **update_document**。**validate_document** で検証だけもできる。
- 新規作成の前に **get_schema** で必須項目と型を確認する。
- 検証シート（\`.tsv\`）は **read_tsv** で読み、**update_tsv_row** / **append_tsv_row** で **行単位**に触る。
  全文を書き直すと「1 レコード = 1 物理行」が崩れ、差分が読めなくなる。
  read_tsv の \`rowIds\` が空でなければ、更新する行は **行 ID** で指す。行 index は利用者が
  1 行挿すだけでずれるので、読んでから書くまでの間に編集が入ると別の行を書き換えてしまう。
  \`directives\` の \`hidden\` は、利用者が表から外して控えにした行。read_tsv には出ないし
  書き換えもできない。控えの扱いはアプリ側の操作なので、宣言を書き換えて戻そうとしない。
  1 枚ずつ読まずに壊れていないかだけを見るなら **check_tsv**（行を返さない・書き換えない）。
  \`directives\` の \`computed\` は、値がほかから決まる列（例 \`computed No. = rowNumber()\`）。
  指定すると書き込みは失敗する。「その列を実数で埋めて」と言われても、それは宣言を直す話であって
  セルを打つ話ではない。打てば集計が消えたまま提出物として出る。
  \`annotations\` はセルに付いた注釈（\`#@ annot\`）で、**読めるが書く口は無い**。
  「なぜこの値にしたのか」を人が自分の言葉で書き残すところなので、同じ欄を埋めると
  後から読んだ人にはどちらの言い分か分からなくなる。\`row\` / \`col\` が null の注釈は、
  控えにした行や知らない列名を指している（打ち間違いを黙って消さないために残してある）。
- 外部から届いた JSON / XML（請求書の交換形式・口座明細・会計サービスの書き出しなど）は
  **read_data** で木構造として読む。これらは正本ではないので **書き戻す口は無い**。
  中身を業務文書にするなら、読んだ内容をもとに create_document / append_tsv_row で作る。
  明細のような繰り返しを表として引用するなら **data_to_table** を使う。木から自前で
  表を組むと列の抜けや \`|\` による桁ずれが起きるが、壊れた表は読める形をしているので気づけない。
- 通信の記録（\`.har\`）は **read_har** で読む。index を省けば概況（件数・時間の範囲・
  ステータス別・ホスト別・遅い順）と一覧、index を指せばその 1 件の中身。
  応答本文は既定で返らないので、要るときだけ \`includeBody\` を付ける。
  「繋ぐと失敗する」の調べ物は、コードを読む前にここで失敗した往復を特定する。
- ログ（\`.log\` / \`.jsonl\` など）は業務文書ではないが、**全文を読み込まない**。
  **search_lines** で当たりを付け、**read_lines** で周辺だけ読む。1 行 1 レコードの形
  （JSONL / TSV）なら **filter_records** で条件を付けて絞り、**aggregate** で
  「いつ・何が・何件」を先に掴む。別々のファイルを突き合わせるなら **build_timeline** で
  時刻順に混ぜる（どの行も出どころと行番号を持ったまま並ぶ）。
  全文を開くと調べる前に文脈が埋まるうえ、
  Authorization / Cookie / token / メールアドレスが伏せ字を通らずに入る。
  これらのツールの戻り値は必ず伏せ字がかかり、上限で切ったときは切ったと返る。
- **このサーバー自身の作業ログ**は \`.md-business/logs/<YYYY-MM-DD>.jsonl\` に 1 日 1 本で残る。
  上のログ用ツールがそのまま使える（\`tool\` / \`ok\` / \`path\` / \`detail\` を持つ）。
  時刻の \`ts\` は数値なので、時間帯や時系列にするときは \`epoch: "milliseconds"\` を添える。
  「昨日どのファイルを触ったか」「どのツールが失敗したか」はここを見る。
- 調べて取り出した中身のうち、報告書の根拠にするものは **save_evidence** で残す。
  返ってきた参照（\`evidence/EV-001.md\`）を所見から指す。会話の中だけに残した抜粋は、
  後から確かめられないので根拠にならない。
- 変更を確認して記録するのは **git_status** / **git_diff** / **git_commit**（利用可能な場合）。

## 書式の約束

- 表のセル・YAML のデータ値の未入力は **空のまま**にする。\`—\` \`N/A\` \`TBD\` などで埋めない。
- スキーマ宣言（frontmatter の \`schema\` / TSV 1 行目の \`#!\` 行）は書き換えない。`;

/** createServer の任意設定。ツール実行のたびに操作ログを受け取れるようにする。 */
export interface CreateServerOptions {
  /** ツール実行 1 件ごとに呼ばれる（HTTP モードでは stdout へ、UI では emit へ流す）。 */
  onLog?: (entry: ToolLogEntry) => void;
  /** ログの時刻源。テストで固定できるよう注入可能にする（既定は実時刻）。 */
  now?: () => number;
  /**
   * `git` 実行器。指定したときだけ git ツールを公開する。
   * ワークスペースが git 管理でない使い方もあるため、既定では公開しない。
   */
  git?: GitRunner;
  /**
   * アプリ画面への依頼口。渡したときだけ画面操作のツールを公開する。
   * 単体（stdio）起動では押すべき画面が無いので既定では公開しない。
   */
  app?: AppBridge;
  /**
   * デスクトップアプリを起こして対象を画面へ出す口。渡したときだけ open_in_app を公開する。
   * アプリが動いていない状態から辿り着けるのはこの口だけなので、単体（stdio）起動でも渡す。
   */
  desktop?: DesktopOpener;
}

/** 任意ペイロードを MCP のテキスト結果へ包む。ToolError 相当は isError で明示する。 */
function jsonResult(payload: unknown, isError = false) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }],
    isError,
  };
}

/** 業務文書の任意 frontmatter（キー文字列・値は任意）。 */
const frontmatterShape = z.record(z.string(), z.unknown());

/** 条件の演算子（filter_records / aggregate 共通）。式は受け付けない。 */
const conditionOps = [
  'eq',
  'ne',
  'contains',
  'startsWith',
  'endsWith',
  'gt',
  'gte',
  'lt',
  'lte',
  'exists',
  'missing',
  'matches',
] as const;

/** 条件 1 つの受け口。 */
const conditionShape = z.object({
  field: z.string().describe('項目名。入れ子は `.` で辿る（例 user.id）'),
  op: z.enum(conditionOps).describe('演算子。matches は JavaScript の正規表現'),
  value: z
    .string()
    .optional()
    .describe('比べる値。exists / missing 以外では必須。数どうしなら数として比べる'),
});

/** 受け取った条件を、value 未指定を落とした形へ直す（exactOptionalPropertyTypes 対応）。 */
function toConditions(where: z.infer<typeof conditionShape>[]): Condition[] {
  return where.map((condition) => {
    const out: Condition = { field: condition.field, op: condition.op };
    if (condition.value !== undefined) out.value = condition.value;
    return out;
  });
}

/**
 * ツール一式を登録した McpServer を組み立てて返す。connect は呼び出し側の責務
 *（テストは InMemoryTransport、本番は StdioServerTransport）。
 */
/** 画面で開いている文書 1 つ分。アプリが持ち帰った中身をこの形に揃えて返す。 */
interface OpenDocumentRow {
  path: string;
  active: boolean;
  /** 保存していない編集が残っているか。閉じる前に知る必要がある。 */
  unsaved: boolean;
}

/**
 * アプリが返した一覧を検査して読み取る。形が違えば null。
 *
 * 制御チャネルは親子で版がずれる前提の路なので、届いた中身をそのまま信じない。
 * 読めないときに空配列で取り繕うと「何も開いていない」と嘘の答えになる。
 */
function parseOpenDocuments(data: unknown): OpenDocumentRow[] | null {
  if (typeof data !== 'object' || data === null) return null;
  const documents = (data as Record<string, unknown>)['documents'];
  if (!Array.isArray(documents)) return null;
  const rows: OpenDocumentRow[] = [];
  for (const entry of documents) {
    if (typeof entry !== 'object' || entry === null) return null;
    const row = entry as Record<string, unknown>;
    const path = row['path'];
    const active = row['active'];
    const unsaved = row['unsaved'];
    if (typeof path !== 'string' || typeof active !== 'boolean' || typeof unsaved !== 'boolean') {
      return null;
    }
    rows.push({ path, active, unsaved });
  }
  return rows;
}

export function createServer(store: DocumentStore, options: CreateServerOptions = {}): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { instructions: SERVER_INSTRUCTIONS },
  );
  const { onLog, now = () => Date.now(), git, app, desktop } = options;

  // ツール実行の直後に 1 件ログを流す。onLog 未指定なら完全に no-op（既存の挙動不変）。
  // argPath は失敗時にパスを拾うためのフォールバック（成功結果は自前の path を持つ）。
  const emit = (tool: string, argPath: string | undefined, result: ToolResultLike): void => {
    if (onLog === undefined) return;
    onLog(buildToolLogEntry(tool, result, argPath, now()));
  };

  server.registerTool(
    'list_schemas',
    {
      description:
        '扱える業務文書スキーマの一覧（id + 日本語ラベル）を返す。create_document の schema 指定前に確認する。',
      inputSchema: {},
    },
    async () => {
      emit('list_schemas', undefined, { ok: true });
      return jsonResult({ schemas: listSchemas() });
    },
  );

  server.registerTool(
    'get_schema',
    {
      description:
        'スキーマ id を指定して JSON Schema 本体を取得する。必須項目・型・選択肢を確認してから create_document / update_document を組み立てるために使う。',
      inputSchema: {
        schema: z.string().describe('スキーマ id（list_schemas 参照・例 invoice/v1）'),
      },
    },
    async ({ schema }) => {
      const def = getSchemaDefinition(schema);
      if (def === null) {
        const r = {
          ok: false as const,
          error: `未知のスキーマ id です: ${schema}（list_schemas で一覧を確認してください）`,
        };
        emit('get_schema', undefined, r);
        return jsonResult(r, true);
      }
      emit('get_schema', undefined, { ok: true });
      return jsonResult({ ok: true, ...def });
    },
  );

  server.registerTool(
    'read_document',
    {
      description:
        'ワークスペース相対パスの Markdown 業務文書を読み、frontmatter / body / 検出スキーマを返す。',
      inputSchema: { path: z.string().describe('ワークスペース相対パス（例 invoices/INV-1.md）') },
    },
    async ({ path }) => {
      const r = await readDocument(store, path);
      emit('read_document', path, r);
      return jsonResult(r, !r.ok);
    },
  );

  server.registerTool(
    'validate_document',
    {
      description:
        '既存文書を宣言スキーマで JSON Schema 検証し、valid とエラー一覧を返す。schema 未宣言は invalid 扱い。',
      inputSchema: { path: z.string().describe('ワークスペース相対パス') },
    },
    async ({ path }) => {
      const r = await validateDocument(store, path);
      emit('validate_document', path, r);
      return jsonResult(r, !r.ok);
    },
  );

  server.registerTool(
    'create_document',
    {
      description:
        '構造化 frontmatter + 本文から新規業務文書を作成する。schema 宣言は種別の正しいキーで自動注入。既存パスは上書きしない。検証結果（valid / errors）も返す。',
      inputSchema: {
        schema: z.string().describe('スキーマ id（list_schemas 参照・例 invoice/v1）'),
        frontmatter: frontmatterShape.describe('構造化 frontmatter（schema 宣言キーは不要）'),
        body: z.string().describe('Markdown 本文'),
        path: z.string().describe('書き込み先ワークスペース相対パス'),
      },
    },
    async ({ schema, frontmatter, body, path }) => {
      const r = await createDocument(store, { schema, frontmatter, body, path });
      emit('create_document', path, r);
      return jsonResult(r, !r.ok);
    },
  );

  server.registerTool(
    'update_document',
    {
      description:
        '既存文書の frontmatter（浅くマージ）／本文を更新する。更新後スキーマで再検証し、更新前後の行 diff と検証結果を返す。',
      inputSchema: {
        path: z.string().describe('更新対象のワークスペース相対パス'),
        frontmatter: frontmatterShape.optional().describe('差し替える frontmatter（省略で据え置き）'),
        body: z.string().optional().describe('差し替える本文（省略で据え置き）'),
      },
    },
    async ({ path, frontmatter, body }) => {
      // exactOptionalPropertyTypes 下では undefined を明示せず、指定された項目のみ渡す。
      const input: UpdateDocumentInput = { path };
      if (frontmatter !== undefined) input.frontmatter = frontmatter;
      if (body !== undefined) input.body = body;
      const r = await updateDocument(store, input);
      emit('update_document', path, r);
      return jsonResult(r, !r.ok);
    },
  );

  // 検証シートは Markdown ではなくカスタム TSV（1 レコード = 1 物理行）なので、
  // read_document / update_document では扱えない。行単位の 3 本を別に用意する。
  server.registerTool(
    'read_tsv',
    {
      description:
        '検証シート（カスタム TSV）を読み、メタ情報・列定義（型 / 必須 / 選択肢）・データ行・行 ID・列型の検証結果を返す。行を書き込む前に列名を確認するために使う。rowIds が空でなければ、update_tsv_row の宛先は行 index ではなくその ID。linkIssues は別シートを指す列（directives の link）の照合結果で、targetPath が指す相手ファイル側の取りこぼしも含む。annotations はセルに付いた注釈で、読むだけ（書く口は無い）。',
      inputSchema: { path: z.string().describe('ワークスペース相対パス（例 sheets/受注.tsv）') },
    },
    async ({ path }) => {
      const r = await readTsv(store, path);
      emit('read_tsv', path, r);
      return jsonResult(r, !r.ok);
    },
  );

  server.registerTool(
    'check_tsv',
    {
      description:
        '検証シートを書き換えずに検査だけする。path を省くとワークスペースの .tsv を全部見る。行は返さないので、read_tsv より軽く「どこか壊れていないか」を見られる。何も無いシートは結果に載らない。short_row はセル内の生改行で 1 レコードが複数の物理行へ割れた疑い。直しはしない（割れ目の取り違えが黙って中身を変えるため）。',
      inputSchema: {
        path: z
          .string()
          .optional()
          .describe('見るシート。省略するとワークスペース全体'),
      },
    },
    async ({ path }) => {
      const r = await checkTsv(store, path === undefined ? {} : { path });
      emit('check_tsv', path ?? '', r);
      return jsonResult(r, !r.ok);
    },
  );

  server.registerTool(
    'append_tsv_row',
    {
      description:
        '検証シートの末尾に 1 行追加する。値は列名をキーに指定し、指定しなかった列は空セル（未入力）のまま残す。列型に反する値も書き込んだうえで issues として返す。計算列（directives の computed）を指定すると失敗する。',
      inputSchema: {
        path: z.string().describe('ワークスペース相対パス'),
        values: z
          .record(z.string(), z.string())
          .describe('列名 → セル値（read_tsv の columns 参照・未指定列は空セル）'),
      },
    },
    async ({ path, values }) => {
      const r = await appendTsvRow(store, { path, values });
      emit('append_tsv_row', path, r);
      return jsonResult(r, !r.ok);
    },
  );

  server.registerTool(
    'update_tsv_row',
    {
      description:
        '検証シートの既存 1 行のうち、指定した列だけを差し替える（他の列は据え置き）。空文字を渡すとそのセルを未入力へ戻す。行は read_tsv の rowIds があれば行 ID で、無ければ行 index で指定する。計算列（directives の computed）を指定すると失敗する。',
      inputSchema: {
        path: z.string().describe('ワークスペース相対パス'),
        row: z
          .union([z.string(), z.number().int()])
          .describe(
            '更新する行。read_tsv の rowIds が空でなければその行 ID、空なら行 index（0 始まり・rows 基準）',
          ),
        values: z.record(z.string(), z.string()).describe('列名 → 差し替えるセル値'),
      },
    },
    async ({ path, row, values }) => {
      const r = await updateTsvRow(store, { path, row, values });
      emit('update_tsv_row', path, r);
      return jsonResult(r, !r.ok);
    },
  );

  // JSON / XML は正本ではないので読む口だけを出す。書き戻しを用意すると、外部から届いた
  // ファイルが編集対象に見えてしまい、正本が Markdown / TSV であることが崩れる。
  server.registerTool(
    'read_data',
    {
      description:
        '外部から届いた JSON / XML を木構造として読む（請求書の交換形式・口座明細・会計サービスの書き出しなど）。名前 / 値 / 属性 / 子の入れ子で返す。既定では 2 世代までしか返さず、深さで切った節には omittedChildren（返さなかった子の数）が付くので、続きは at で降りて取る。読むだけで、このツールでは書き換えられない。DTD 宣言のある XML は読まずに断る。',
      inputSchema: {
        path: z.string().describe('ワークスペース相対パス（例 data/請求.xml）'),
        at: z
          .array(z.string())
          .optional()
          .describe(
            '読む位置。根からたどる子の名前の並び（例 ["取引先","住所"]）。配列の要素は添字の名前（"0"）。XML の根要素は含めない。同名の兄弟が並ぶ場所は "行#1" のように 0 始まりの番号で選ぶ。省略すると根',
          ),
        depth: z
          .number()
          .int()
          .optional()
          .describe('返す世代数。0 は指した節だけ、-1 は下をすべて。省略時は 2'),
      },
    },
    async ({ path, at, depth }) => {
      // exactOptionalPropertyTypes 下では undefined を明示せず、指定された項目のみ渡す。
      const options: ReadDataOptions = {};
      if (at !== undefined) options.at = at;
      if (depth !== undefined) options.depth = depth;
      const r = await readData(store, path, options);
      emit('read_data', path, r);
      return jsonResult(r, !r.ok);
    },
  );

  server.registerTool(
    'data_to_table',
    {
      description:
        'JSON / XML の繰り返し（配列・同名要素の並び）を Markdown の表に写す。at で指した節の子が 1 行になる。列は行に現れた順の和で、その行に無い項目は空セルのまま。セルの | は退避し、改行とタブは空白に畳む。表に出せないものは黙って落とさず、nestedColumns（さらに子を持つ項目）/ multiValuedColumns（1 行に複数現れ先頭だけ載せた項目）/ truncated（上限で載せなかった行数）で返すので、続きは read_data で取る。返るのは Markdown 文字列で、ファイルには書かない。',
      inputSchema: {
        path: z.string().describe('ワークスペース相対パス（例 data/請求.xml）'),
        at: z
          .array(z.string())
          .optional()
          .describe(
            '表にする並びの親。指した節の子が 1 行ずつになる（例 ["明細"]）。XML の根要素は含めない。省略すると根',
          ),
        limit: z
          .number()
          .int()
          .optional()
          .describe('載せる行数の上限。省略時は 200。超えた分は truncated に件数で返る'),
      },
    },
    async ({ path, at, limit }) => {
      const options: DataToTableOptions = {};
      if (at !== undefined) options.at = at;
      if (limit !== undefined) options.limit = limit;
      const r = await dataToTable(store, path, options);
      emit('data_to_table', path, r);
      return jsonResult(r, !r.ok);
    },
  );

  // 通信の記録も正本ではないので読む口だけ。切り口ごとにツールを分けず、
  // 引数で「概況 → 1 件」の順に降りられるようにする。
  server.registerTool(
    'read_har',
    {
      description:
        'HAR（通信の記録・DevTools や Charles などが書き出す）を読む。index を省くと概況（件数・時間の範囲・ステータス別・ホスト別・遅い順）と一覧を返し、index を指すとその 1 件の見出し・クエリ・Cookie・本文の形を返す。応答本文は既定では返さない（includeBody で取る）。Authorization / Cookie / token などは伏せ字を通り、伏せた件数が masked に返る。読むだけで、このツールでは書き換えられない。',
      inputSchema: {
        path: z.string().describe('ワークスペース相対パス（例 investigations/通信.har）'),
        index: z
          .number()
          .int()
          .optional()
          .describe('中身を出す 1 件（一覧の index）。省略すると概況と一覧'),
        includeBody: z
          .boolean()
          .optional()
          .describe('応答・要求の本文を返すか（index を指したときだけ効く）。省略すると返さない'),
        maxBodyLength: z.number().int().optional().describe('本文の長さの上限。省略時は 2000'),
        status: z.number().int().optional().describe('このステータスだけ'),
        statusMin: z.number().int().optional().describe('これ以上のステータスだけ（400 で失敗だけ）'),
        statusMax: z.number().int().optional().describe('これ以下のステータスだけ'),
        host: z.string().optional().describe('このホストだけ（大文字小文字を問わない）'),
        urlContains: z.string().optional().describe('URL にこの文字列を含むものだけ'),
        method: z.string().optional().describe('この手立てだけ（GET / POST。大文字小文字を問わない）'),
        from: z.string().optional().describe('この時刻以降（ISO 8601）'),
        to: z.string().optional().describe('この時刻以前（ISO 8601）'),
        limit: z.number().int().optional().describe('一覧に返す件数。省略時は 50'),
        offset: z.number().int().optional().describe('一覧の開始位置。省略時は 0'),
      },
    },
    async (args) => {
      const input: ReadHarInput = { path: args.path };
      for (const key of [
        'index',
        'includeBody',
        'maxBodyLength',
        'status',
        'statusMin',
        'statusMax',
        'host',
        'urlContains',
        'method',
        'from',
        'to',
        'limit',
        'offset',
      ] as const) {
        const value = args[key];
        if (value !== undefined) Object.assign(input, { [key]: value });
      }
      const r = await readHar(store, input);
      emit('read_har', args.path, r);
      return jsonResult(r, !r.ok);
    },
  );

  // ログは業務文書ではないので、文書ツールとは別の口にする。全文は返さず、
  // 探した結果だけを返す（そのまま渡すと調査以前にコンテキストが埋まる）。
  server.registerTool(
    'search_lines',
    {
      description:
        'ログなどのテキストファイルを正規表現で行検索し、一致行を行番号つきで返す（before / after で前後の行も取れる）。ファイル全体は読み込まず、行単位で流して探す。戻り値には伏せ字がかかり、Authorization / Cookie / token / api_key / password / メールアドレス / カード番号らしき数字列は残らない（外す指定は無い。生の値が要るなら人がファイルを開く）。上限に達したら truncated: true、長すぎて切った行は truncatedLines で返るので、切られたことに気づかないまま結論を出さないこと。',
      inputSchema: {
        path: z.string().describe('ワークスペース相対パス（例 logs/app.log）'),
        pattern: z.string().describe('正規表現（JavaScript の構文）'),
        ignoreCase: z.boolean().optional().describe('大文字小文字を無視する。省略時は区別する'),
        before: z.number().int().optional().describe('一致行の前を何行付けるか。省略時は 0・上限 20'),
        after: z.number().int().optional().describe('一致行の後を何行付けるか。省略時は 0・上限 20'),
        maxMatches: z
          .number()
          .int()
          .optional()
          .describe('返す一致の上限。省略時は 100・上限 1000。達したら truncated: true で返る'),
        maxLineLength: z
          .number()
          .int()
          .optional()
          .describe('1 行あたりの文字数上限。省略時は 2000・上限 20000'),
      },
    },
    async ({ path, pattern, ignoreCase, before, after, maxMatches, maxLineLength }) => {
      // exactOptionalPropertyTypes 下では undefined を明示せず、指定された項目のみ渡す。
      const input: SearchLinesInput = { path, pattern };
      if (ignoreCase !== undefined) input.ignoreCase = ignoreCase;
      if (before !== undefined) input.before = before;
      if (after !== undefined) input.after = after;
      if (maxMatches !== undefined) input.maxMatches = maxMatches;
      if (maxLineLength !== undefined) input.maxLineLength = maxLineLength;
      const r = await searchLines(store, input);
      emit('search_lines', path, r);
      return jsonResult(r, !r.ok);
    },
  );

  server.registerTool(
    'read_lines',
    {
      description:
        'テキストファイルの行範囲（from 〜 to・1 始まり・両端含む）を行番号つきで返す。search_lines で見つけた箇所の周辺を読むためのもの。戻り値には search_lines と同じ伏せ字がかかる。上限を超える範囲は truncated: true で切って返す。',
      inputSchema: {
        path: z.string().describe('ワークスペース相対パス（例 logs/app.log）'),
        from: z.number().int().describe('開始行（1 始まり・この行を含む）'),
        to: z.number().int().describe('終了行（この行を含む）'),
        maxLines: z.number().int().optional().describe('返す行数の上限。省略時は 500・上限 5000'),
        maxLineLength: z
          .number()
          .int()
          .optional()
          .describe('1 行あたりの文字数上限。省略時は 2000・上限 20000'),
      },
    },
    async ({ path, from, to, maxLines, maxLineLength }) => {
      const input: ReadLinesInput = { path, from, to };
      if (maxLines !== undefined) input.maxLines = maxLines;
      if (maxLineLength !== undefined) input.maxLineLength = maxLineLength;
      const r = await readLines(store, input);
      emit('read_lines', path, r);
      return jsonResult(r, !r.ok);
    },
  );

  // 条件は列挙した演算子の組み合わせだけで書かせる。式を文字列で受け取って評価する作りは、
  // ツールの権限がそのまま任意コード実行になるので用意しない。
  server.registerTool(
    'filter_records',
    {
      description:
        '1 行 1 レコードのログ（JSONL / TSV）を条件で絞り、行番号つきで返す。条件は field と演算子の組み合わせで指定する（式は受け付けない）。絞り込みは元の値に当たるので伏せ字対象の値でも探せるが、**返る値には必ず伏せ字がかかる**。読めない行は skipped に数えて読み進め、上限に達したら truncated: true で返る。形式は拡張子（.jsonl / .ndjson / .tsv）から判り、判らなければ format を指定する（推測はしない）。',
      inputSchema: {
        path: z.string().describe('ワークスペース相対パス（例 logs/app.jsonl）'),
        format: z
          .enum(['jsonl', 'tsv'])
          .optional()
          .describe('形式。省略時は拡張子から判別し、判別できなければエラーにする'),
        where: z.array(conditionShape).optional().describe('条件。省略すると全件'),
        match: z.enum(['all', 'any']).optional().describe('条件の結び方。省略時は all'),
        fields: z
          .array(z.string())
          .optional()
          .describe('返す項目（`.` 区切り）。省略するとレコード全体'),
        maxRecords: z
          .number()
          .int()
          .optional()
          .describe('返すレコード数の上限。省略時は 200・上限 2000'),
        maxValueLength: z
          .number()
          .int()
          .optional()
          .describe('文字列 1 つあたりの文字数上限。省略時は 2000・上限 20000'),
      },
    },
    async ({ path, format, where, match, fields, maxRecords, maxValueLength }) => {
      const input: FilterRecordsInput = { path };
      if (format !== undefined) input.format = format;
      if (where !== undefined) input.where = toConditions(where);
      if (match !== undefined) input.match = match;
      if (fields !== undefined) input.fields = fields;
      if (maxRecords !== undefined) input.maxRecords = maxRecords;
      if (maxValueLength !== undefined) input.maxValueLength = maxValueLength;
      const r = await filterRecords(store, input);
      emit('filter_records', path, r);
      return jsonResult(r, !r.ok);
    },
  );

  server.registerTool(
    'aggregate',
    {
      description:
        '1 行 1 レコードのログ（JSONL / TSV）を、キー別・時間帯別に数える。件数だけを返すので、全文を読まずに「いつ・何が・何件」を掴める。時刻は読めた形式（ISO 8601 など）だけを読み、読めなかった分は捨てずに「時刻不明」として数える。数値の時刻は epoch を指定したときだけ読む（桁数から推測しない）。キーの値には返す直前に伏せ字がかかる。',
      inputSchema: {
        path: z.string().describe('ワークスペース相対パス（例 logs/app.jsonl）'),
        format: z
          .enum(['jsonl', 'tsv'])
          .optional()
          .describe('形式。省略時は拡張子から判別し、判別できなければエラーにする'),
        where: z.array(conditionShape).optional().describe('数える前に絞る条件。省略すると全件'),
        match: z.enum(['all', 'any']).optional().describe('条件の結び方。省略時は all'),
        groupBy: z
          .array(z.string())
          .optional()
          .describe('キーにする項目（`.` 区切り）。省略すると全体で 1 件に数える'),
        timeField: z.string().optional().describe('時間帯のキーにする項目（例 ts）'),
        bucket: z
          .enum(['day', 'hour', 'minute', 'second'])
          .optional()
          .describe('時間帯の単位。省略時は hour。timeField と一緒に指定する'),
        epoch: z
          .enum(['seconds', 'milliseconds'])
          .optional()
          .describe('数値の時刻の単位。指定しない限り数値は時刻として読まない'),
        maxGroups: z
          .number()
          .int()
          .optional()
          .describe('返すキーの数の上限。省略時は 50・上限 1000'),
        sort: z.enum(['count', 'key']).optional().describe('並べ方。省略時は count（多い順）'),
      },
    },
    async ({ path, format, where, match, groupBy, timeField, bucket, epoch, maxGroups, sort }) => {
      const input: AggregateInput = { path };
      if (format !== undefined) input.format = format;
      if (where !== undefined) input.where = toConditions(where);
      if (match !== undefined) input.match = match;
      if (groupBy !== undefined) input.groupBy = groupBy;
      if (timeField !== undefined) input.timeField = timeField;
      if (bucket !== undefined) input.bucket = bucket;
      if (epoch !== undefined) input.epoch = epoch;
      if (maxGroups !== undefined) input.maxGroups = maxGroups;
      if (sort !== undefined) input.sort = sort;
      const r = await aggregate(store, input);
      emit('aggregate', path, r);
      return jsonResult(r, !r.ok);
    },
  );

  server.registerTool(
    'build_timeline',
    {
      description:
        '複数のログ（JSONL / TSV）の行を時刻順に 1 本へ混ぜて返す。どの行も「どのファイルの何行目か」を持ったまま並ぶ。時刻は読めた形式（ISO 8601 など）だけを読み、読めなかった行は捨てずに time=null として末尾に付ける。数値の時刻は epoch を指定したときだけ読む（桁数から推測しない）。レコードには返す直前に伏せ字がかかる。',
      inputSchema: {
        sources: z
          .array(
            z.object({
              path: z.string().describe('ワークスペース相対パス（例 logs/app.jsonl）'),
              format: z.enum(['jsonl', 'tsv']).optional().describe('形式。省略時は拡張子から判別'),
              timeField: z.string().describe('時刻にする項目（`.` 区切り。例 ts）'),
              label: z.string().optional().describe('出どころの表示名。省略するとパス'),
            }),
          )
          .describe('混ぜるファイル（1〜20 件）。時刻の項目名はファイルごとに指定する'),
        where: z.array(conditionShape).optional().describe('混ぜる前に絞る条件（全ファイル共通）'),
        match: z.enum(['all', 'any']).optional().describe('条件の結び方。省略時は all'),
        from: z.string().optional().describe('この時刻以降だけを混ぜる。読めた時刻にだけ効く'),
        to: z.string().optional().describe('この時刻以前だけを混ぜる。読めた時刻にだけ効く'),
        epoch: z
          .enum(['seconds', 'milliseconds'])
          .optional()
          .describe('数値の時刻の単位。指定しない限り数値は時刻として読まない'),
        fields: z.array(z.string()).optional().describe('返す項目（`.` 区切り）。省略すると全体'),
        maxEvents: z
          .number()
          .int()
          .optional()
          .describe('返す出来事の数の上限。省略時は 200・上限 2000'),
        maxValueLength: z
          .number()
          .int()
          .optional()
          .describe('文字列 1 つの文字数上限。省略時は 2000・上限 20000'),
      },
    },
    async ({ sources, where, match, from, to, epoch, fields, maxEvents, maxValueLength }) => {
      const input: BuildTimelineInput = {
        sources: sources.map((source) => {
          const one: TimelineSource = { path: source.path, timeField: source.timeField };
          if (source.format !== undefined) one.format = source.format;
          if (source.label !== undefined) one.label = source.label;
          return one;
        }),
      };
      if (where !== undefined) input.where = toConditions(where);
      if (match !== undefined) input.match = match;
      if (from !== undefined) input.from = from;
      if (to !== undefined) input.to = to;
      if (epoch !== undefined) input.epoch = epoch;
      if (fields !== undefined) input.fields = fields;
      if (maxEvents !== undefined) input.maxEvents = maxEvents;
      if (maxValueLength !== undefined) input.maxValueLength = maxValueLength;
      const r = await buildTimeline(store, input);
      emit('build_timeline', sources[0]?.path, r);
      return jsonResult(r, !r.ok);
    },
  );

  server.registerTool(
    'save_evidence',
    {
      description:
        '調べて取り出した中身を Evidence として 1 件 1 ファイルに保存し、報告書から書く参照（evidence/EV-001.md）を返す。番号は空いている次のものを自動で振る。既にある Evidence は上書きしない。保存する前に伏せ字がかかるので、伏せた値は成果物にも残らない。',
      inputSchema: {
        title: z.string().describe('何の証拠か（1 行）'),
        tool: z
          .enum([
            'search_lines',
            'read_lines',
            'filter_records',
            'aggregate',
            'build_timeline',
            'manual',
          ])
          .describe('どのツールで取り出したか'),
        sources: z
          .array(z.string())
          .describe('元にしたファイルのワークスペース相対パス（1 件以上）'),
        body: z.string().describe('取り出した中身そのもの'),
        note: z.string().optional().describe('なぜ残すか（所見との対応など）'),
        id: z.string().optional().describe('番号（例 EV-042）。省略すると空いている次の番号'),
      },
    },
    async ({ title, tool, sources, body, note, id }) => {
      const input: SaveEvidenceInput = { title, tool, sources, body };
      if (note !== undefined) input.note = note;
      if (id !== undefined) input.id = id;
      const r = await saveEvidence(store, input, now);
      emit('save_evidence', r.ok ? r.path : undefined, r);
      return jsonResult(r, !r.ok);
    },
  );

  server.registerTool(
    'search_documents',
    {
      description:
        'ワークスペースの業務文書と検証シートを全文クエリ・スキーマ・日付範囲で検索し、path / kind / schema / title / date / 抜粋の一覧を返す。kind=sheet は検証シート（TSV）なので read_tsv 系で扱う。スキーマ・日付で絞ったときは検証シートを含めない。',
      inputSchema: {
        query: z.string().optional().describe('本文・frontmatter への部分一致（未指定で全件）'),
        schema: z.string().optional().describe('スキーマ id で絞る'),
        dateFrom: z.string().optional().describe('ISO 日付以降（両端含む）'),
        dateTo: z.string().optional().describe('ISO 日付以前（両端含む）'),
      },
    },
    async ({ query, schema, dateFrom, dateTo }) => {
      // exactOptionalPropertyTypes 下では undefined を明示せず、指定された項目のみ渡す。
      const sq: SearchQuery = {};
      if (query !== undefined) sq.query = query;
      if (schema !== undefined) sq.schema = schema;
      if (dateFrom !== undefined) sq.dateFrom = dateFrom;
      if (dateTo !== undefined) sq.dateTo = dateTo;
      const r = await searchDocuments(store, sq);
      emit('search_documents', undefined, { ok: true });
      return jsonResult(r);
    },
  );

  server.registerTool(
    'declare_web_mode',
    {
      description:
        `${PROJECT_CONFIG_FILENAME} に web モードを宣言し、このフォルダを HTML / CSS / JS ごと組み立てて見られる形にする。` +
        '宣言はプロジェクトが求めているものを書くだけで、実行の許可ではない。' +
        '許可は利用者が自分の PC で 1 回与えるもので、ここから触れる口は無い。' +
        '既にある宣言は書き換えず、そのまま返す。',
      inputSchema: {},
    },
    async () => {
      // 宣言が無いフォルダは「まだ何も言っていない」だけなので、空として読む。
      // 置いてあるのに読めないのは別で、その場合は中身が分からない以上、
      // 書き換えてよい相手かを決められない。触らずに返す。
      let source = '';
      if (await store.exists(PROJECT_CONFIG_FILENAME)) {
        try {
          source = await store.read(PROJECT_CONFIG_FILENAME);
        } catch (error) {
          const r = {
            ok: false as const,
            error: `${PROJECT_CONFIG_FILENAME} を読めないので、書き換えませんでした（${String(error)}）。`,
            path: PROJECT_CONFIG_FILENAME,
          };
          emit('declare_web_mode', PROJECT_CONFIG_FILENAME, r);
          return jsonResult(r, true);
        }
      }

      const plan = planDeclareWebMode(source);
      if (plan.kind === 'refuse') {
        const r = { ok: false as const, error: plan.error, path: PROJECT_CONFIG_FILENAME };
        emit('declare_web_mode', PROJECT_CONFIG_FILENAME, r);
        return jsonResult(r, true);
      }

      if (plan.kind === 'write') await store.write(PROJECT_CONFIG_FILENAME, WEB_MODE_DECLARATION_TEXT);
      const written = plan.kind === 'write' ? WEB_MODE_DECLARATION_TEXT : source;
      const { config } = parseProjectConfig(written);
      const r = {
        ok: true as const,
        changed: plan.kind === 'write',
        mode: config.mode,
        scriptOrigins: config.scriptOrigins,
        path: PROJECT_CONFIG_FILENAME,
        summary: declareSummary(plan.kind === 'write'),
      };
      emit('declare_web_mode', PROJECT_CONFIG_FILENAME, r);
      return jsonResult(r);
    },
  );

  server.registerTool(
    'write_site_file',
    {
      description:
        'サイトの部品（HTML / CSS / JS など）を 1 ファイル書く。中身は渡されたまま置く。' +
        `web モードを名乗っているフォルダでしか書けない（先に declare_web_mode）。` +
        '業務文書（.md）と検証シート（.tsv）はここでは書かない——それぞれ専用の口がある。' +
        '書いた結果が意図どおりかは、ブラウザで見て確かめる。',
      inputSchema: {
        path: z.string().describe('ワークスペース相対パス（例 index.html / assets/app.js）'),
        content: z.string().describe('ファイルの中身そのもの。既にあれば置き換える'),
      },
    },
    async ({ path, content }) => {
      const r = await writeSiteFile(store, { path, content });
      emit('write_site_file', r.ok ? r.path : path, r);
      return jsonResult(r, !r.ok);
    },
  );

  server.registerTool(
    'read_site_file',
    {
      description:
        'サイトの部品（HTML / CSS / JS など）を 1 ファイル読む。置いてあるままを返す。' +
        '既にあるファイルを直すときは、まずここで読んでから write_site_file で書き戻す。' +
        '業務文書（.md）は read_document、検証シート（.tsv）は read_tsv で読む。',
      inputSchema: {
        path: z.string().describe('ワークスペース相対パス（例 index.html / assets/app.js）'),
      },
    },
    async ({ path }) => {
      const r = await readSiteFile(store, { path });
      emit('read_site_file', r.ok ? r.path : path, r);
      return jsonResult(r, !r.ok);
    },
  );

  // git ツールは実行器が渡されたときだけ公開する。
  // push は含めない — リモートへ出す操作は人が内容を確認してから行う。
  if (git !== undefined) {
    server.registerTool(
      'git_status',
      {
        description:
          'ワークスペースの変更状況（ブランチ・upstream との差・変更ファイル一覧）を返す。編集内容をコミットする前の確認に使う。',
        inputSchema: {},
      },
      async () => {
        const r = await gitStatus(git);
        emit('git_status', undefined, r);
        return jsonResult(r, !r.ok);
      },
    );

    server.registerTool(
      'git_diff',
      {
        description:
          'HEAD と作業ツリーの差分を unified diff で返す。path を指定すると 1 ファイルに絞る。未追跡ファイルは差分が出ないので untracked:true を返す（中身は read_document で読む）。',
        inputSchema: {
          path: z.string().optional().describe('ワークスペース相対パス（省略で全体）'),
        },
      },
      async ({ path }) => {
        const r = path === undefined ? await gitDiff(git) : await gitDiff(git, path);
        emit('git_diff', path, r);
        return jsonResult(r, !r.ok);
      },
    );

    server.registerTool(
      'git_commit',
      {
        description:
          '変更をステージしてコミットする（push はしない）。paths を指定するとその分だけ、省略すると全変更をコミットし、コミットハッシュと最新の変更状況を返す。',
        inputSchema: {
          message: z.string().describe('コミットメッセージ'),
          paths: z
            .array(z.string())
            .optional()
            .describe('コミットするワークスペース相対パス（省略で全変更）'),
        },
      },
      async ({ message, paths }) => {
        // exactOptionalPropertyTypes 下では undefined を明示せず、指定された項目のみ渡す。
        const input: GitCommitInput = { message };
        if (paths !== undefined) input.paths = paths;
        const r = await gitCommit(git, input);
        emit('git_commit', undefined, r);
        return jsonResult(r, !r.ok);
      },
    );
  }

  // 画面を伴う操作はサーバー単体では行えない。アプリへ頼み、その可否を返す。
  // どちらもサイドカーとして動いているときだけ公開する（素のサーバーには画面が無い）。
  if (app !== undefined) {
    server.registerTool(
      'open_document',
      {
        description:
          'デスクトップアプリの表示を対象文書に切り替える。開いているフォルダの中だけを指定でき、印刷は行わない。',
        inputSchema: {
          path: z.string().describe('画面に出すワークスペース相対パス'),
        },
      },
      async ({ path }) => {
        const safe = safeRelativePath(path);
        if (!safe.ok) {
          const r = { ok: false as const, error: safe.reason };
          emit('open_document', path, r);
          return jsonResult(r, true);
        }
        const result = await app.request({ action: 'open-document', path: safe.relative });
        const r = result.ok ? { ok: true as const, path: safe.relative } : result;
        emit('open_document', safe.relative, r);
        return jsonResult(r, !r.ok);
      },
    );

    server.registerTool(
      'list_open_documents',
      {
        description:
          'デスクトップアプリで今開いている文書の一覧を返す。どれが手前にあるか、保存していない編集が残っているかも分かる。閉じる・切り替えるの前に確認する。',
        inputSchema: {},
      },
      async () => {
        const result = await app.request({ action: 'list-documents' });
        if (!result.ok) {
          emit('list_open_documents', undefined, result);
          return jsonResult(result, true);
        }
        const documents = parseOpenDocuments(result.data);
        const r =
          documents === null
            ? { ok: false as const, error: 'アプリから開いている文書の一覧を受け取れませんでした' }
            : { ok: true as const, documents };
        emit('list_open_documents', undefined, r);
        return jsonResult(r, !r.ok);
      },
    );

    server.registerTool(
      'close_document',
      {
        description:
          'デスクトップアプリで開いている文書を閉じる。保存していない編集があれば先に保存してから閉じる。開いていない文書は閉じられない。',
        inputSchema: {
          path: z.string().describe('閉じるワークスペース相対パス'),
        },
      },
      async ({ path }) => {
        const safe = safeRelativePath(path);
        if (!safe.ok) {
          const r = { ok: false as const, error: safe.reason };
          emit('close_document', path, r);
          return jsonResult(r, true);
        }
        const result = await app.request({ action: 'close-document', path: safe.relative });
        const r = result.ok ? { ok: true as const, path: safe.relative } : result;
        emit('close_document', safe.relative, r);
        return jsonResult(r, !r.ok);
      },
    );

    server.registerTool(
      'web_mode_status',
      {
        description:
          'このフォルダでプロジェクトの JavaScript が動くかを調べる。md-business.yml の宣言と、この PC での許可の両方を見る。未許可なら、何が宣言されているかを添えて「許可待ち」として返る。許可を与えることはできない（利用者がアプリで行う操作）。',
        inputSchema: {},
      },
      async () => {
        const result = await app.request({ action: 'trust-status' });
        if (!result.ok) {
          emit('web_mode_status', undefined, result);
          return jsonResult(result, true);
        }
        const trust = parseTrustAnswer(result.data);
        if (trust === null) {
          // 読めない答えを「許可済み」に寄せない。分からないことをそのまま返す。
          const unknown = { ok: false as const, error: 'アプリから許可の状態を受け取れませんでした' };
          emit('web_mode_status', undefined, unknown);
          return jsonResult(unknown, true);
        }
        // 宣言が無い・読めないはどちらも「script を動かさない」側へ落ちる（parseProjectConfig）。
        // ここで読めなさを失敗として返すと、宣言していないだけのフォルダが失敗に見える。
        let declaration = '';
        try {
          declaration = await store.read(PROJECT_CONFIG_FILENAME);
        } catch {
          declaration = '';
        }
        const r = { ok: true as const, ...describeWebMode(declaration, trust) };
        emit('web_mode_status', undefined, r);
        return jsonResult(r, false);
      },
    );

    server.registerTool(
      'export_pdf',
      {
        description:
          'デスクトップアプリで対象文書を開き、PDF 出力（印刷）ダイアログを表示する。保存先の指定と保存操作は利用者が行う。',
        inputSchema: {
          path: z.string().describe('PDF にするワークスペース相対パス'),
        },
      },
      async ({ path }) => {
        const safe = safeRelativePath(path);
        if (!safe.ok) {
          const r = { ok: false as const, error: safe.reason };
          emit('export_pdf', path, r);
          return jsonResult(r, true);
        }
        const result = await app.request({ action: 'export-pdf', path: safe.relative });
        const r = result.ok ? { ok: true as const, path: safe.relative } : result;
        emit('export_pdf', safe.relative, r);
        return jsonResult(r, !r.ok);
      },
    );
  }

  // アプリが動いていなくても辿り着ける唯一の口。起動・フォルダの切り替え・表示を 1 手で行う。
  // 二重起動の抑止と、動いている窓へパスを渡し直す判断はアプリ側が持つ。
  if (desktop !== undefined) {
    server.registerTool(
      'open_in_app',
      {
        description:
          'デスクトップアプリで対象ファイルを開く。アプリが起動していなければ起動し、開いているフォルダが違えばワークスペースのフォルダへ切り替えてから表示する。利用者に画面で見てもらうときに使う。',
        inputSchema: {
          path: z.string().describe('画面に出すワークスペース相対パス'),
        },
      },
      async ({ path }) => {
        const r = await desktop.open(path);
        emit('open_in_app', path, r);
        return jsonResult(r, !r.ok);
      },
    );
  }

  return server;
}
