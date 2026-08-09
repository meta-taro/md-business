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
import { readTsv, appendTsvRow, updateTsvRow } from './tsvTools.js';
import { searchDocuments } from './search.js';
import type { SearchQuery } from './search.js';
import { gitStatus, gitDiff, gitCommit } from './gitTools.js';
import type { GitCommitInput, GitRunner } from './gitTools.js';
import type { AppBridge } from './appBridge.js';
import { safeRelativePath } from './workspacePath.js';
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
  \`directives\` の \`computed\` は、値がほかから決まる列（例 \`computed No. = rowNumber()\`）。
  指定すると書き込みは失敗する。「その列を実数で埋めて」と言われても、それは宣言を直す話であって
  セルを打つ話ではない。打てば集計が消えたまま提出物として出る。
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

/**
 * ツール一式を登録した McpServer を組み立てて返す。connect は呼び出し側の責務
 *（テストは InMemoryTransport、本番は StdioServerTransport）。
 */
export function createServer(store: DocumentStore, options: CreateServerOptions = {}): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { instructions: SERVER_INSTRUCTIONS },
  );
  const { onLog, now = () => Date.now(), git, app } = options;

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
        '検証シート（カスタム TSV）を読み、メタ情報・列定義（型 / 必須 / 選択肢）・データ行・行 ID・列型の検証結果を返す。行を書き込む前に列名を確認するために使う。rowIds が空でなければ、update_tsv_row の宛先は行 index ではなくその ID。',
      inputSchema: { path: z.string().describe('ワークスペース相対パス（例 sheets/受注.tsv）') },
    },
    async ({ path }) => {
      const r = await readTsv(store, path);
      emit('read_tsv', path, r);
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

  // PDF 出力はアプリの画面（プレビュー）を印刷する機能なので、サーバー単体では行えない。
  // アプリに「対象を開いて PDF ボタンを押す」ところまでを頼み、その可否を返す。
  if (app !== undefined) {
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

  return server;
}
