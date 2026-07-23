# @md-business/mcp-server

md-business の **MCP（Model Context Protocol）サーバー**。Claude Desktop / Claude Code / Cursor / Cline などの AI エージェントが、Markdown 業務文書（適格請求書・基本設計書・検証シート・DB 設計書・API 詳細設計書）を**正本として直接**読み書き・検証・検索できるようにする Node sidecar（stdio 接続）。

アーキテクチャは Tauri Desktop から起動する Node sidecar（stdio 接続）。

## 提供ツール（P0）

| ツール | 役割 |
|---|---|
| `list_schemas` | 扱える業務文書スキーマの一覧（id + 日本語ラベル）を返す |
| `read_document` | 相対パスの文書を読み、frontmatter / body / 検出スキーマを返す |
| `validate_document` | 既存文書を宣言スキーマで JSON Schema 検証（schema 未宣言は invalid 扱い） |
| `create_document` | 構造化 frontmatter + 本文から新規作成。schema 宣言キーを種別ごとに自動注入。既存パスは上書きしない |
| `update_document` | frontmatter（浅くマージ）／本文を更新。更新後スキーマで再検証し、更新前後の行 diff を返す |
| `search_documents` | 全文クエリ・スキーマ・日付範囲で検索し、path / schema / title / date / 抜粋を返す |

対応スキーマ: `invoice/v1` / `spec/v1` / `test-spec/v1` / `db-spec/v1` / `nosql-db-spec/v1` / `api-spec/v1`。

> **`git_push` は MCP ツールとして提供しない**（push は人間が最終確認する運用のため）。
> **secrets / API キーは MCP サーバーが受け取らない**（人間が直接投入する）。

## ビルド

```bash
pnpm --filter @md-business/mcp-server build
```

`dist/bin.js` が生成される。

## Claude Desktop への接続

`claude_desktop_config.json`（macOS: `~/Library/Application Support/Claude/`、Windows: `%APPDATA%\Claude\`）へ以下を追記する。`<repo>` は md-business のクローン先絶対パス、`<workspace>` は業務文書を置くフォルダの絶対パス。

```json
{
  "mcpServers": {
    "md-business": {
      "command": "node",
      "args": [
        "<repo>/packages/mcp-server/dist/bin.js",
        "<workspace>"
      ]
    }
  }
}
```

Claude Desktop を再起動すると、md-business の 6 ツールが利用可能になる。

### ワークスペース root の解決順

1. 第1引数（上記 `args` の `<workspace>`）
2. 環境変数 `MD_BUSINESS_WORKSPACE`
3. カレントディレクトリ

指定 root の外へのアクセスは拒否される（多重防御）。

## 動作確認（手動スモーク）

ビルド後、stdio で initialize + tools/list ハンドシェイクを流す:

```bash
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
  | node dist/bin.js "$(pwd)"
```

`serverInfo` と 6 ツールの一覧が stdout に JSON-RPC で返れば正常。ログは stderr にのみ出る（stdout は MCP プロトコル専用チャネル）。

## テスト

```bash
pnpm --filter @md-business/mcp-server test:run
```

決定ロジック（diff / search / registry / tools / workspacePath）は純関数として単体テスト、SDK 配線は `InMemoryTransport` + `Client` で end-to-end 検証する。

## 設計メモ

- 検証器は各 schema パッケージの JSON Schema から**実行時に Ajv2020 でコンパイル**する。schema パッケージが公開する standalone compiled validator は bundler / Apps Script 向けで生 Node ESM では解決できないため、MCP（CSP 制約のない Node sidecar）側で runtime Ajv を使う。schema パッケージ自体には手を入れない。
- I/O は `DocumentStore` インターフェース越し。本番は `FileDocumentStore`（node:fs）、テスト・dry-run は `MemoryDocumentStore`。
