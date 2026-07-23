/**
 * MCP サーバー本体（Issue 004 Phase 2・Block MCP-6）。
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
import { listSchemas } from './registry.js';
import {
  readDocument,
  validateDocument,
  createDocument,
  updateDocument,
} from './tools.js';
import type { UpdateDocumentInput } from './tools.js';
import { searchDocuments } from './search.js';
import type { SearchQuery } from './search.js';

/** MCP クライアントへ提示するサーバー名 / バージョン（プロトコル上の識別子）。 */
export const SERVER_NAME = 'md-business';
export const SERVER_VERSION = '0.1.0';

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
export function createServer(store: DocumentStore): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

  server.registerTool(
    'list_schemas',
    {
      description:
        '扱える業務文書スキーマの一覧（id + 日本語ラベル）を返す。create_document の schema 指定前に確認する。',
      inputSchema: {},
    },
    async () => jsonResult({ schemas: listSchemas() }),
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
      return jsonResult(r, !r.ok);
    },
  );

  server.registerTool(
    'search_documents',
    {
      description:
        'ワークスペースの業務文書を全文クエリ・スキーマ・日付範囲で検索し、path / schema / title / date / 抜粋の一覧を返す。',
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
      return jsonResult(r);
    },
  );

  return server;
}
