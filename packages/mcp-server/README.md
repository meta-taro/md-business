# @md-business/mcp-server

md-business の **MCP（Model Context Protocol）サーバー**。Claude Desktop / Claude Code / Cursor / Cline などの AI エージェントが、Markdown 業務文書（適格請求書・基本設計書・検証シート・DB 設計書・API 詳細設計書）を**正本として直接**読み書き・検証・検索できるようにする Node sidecar（stdio 接続）。

アーキテクチャは Tauri Desktop から起動する Node sidecar（stdio 接続）。

## 提供ツール（P0）

| ツール | 役割 |
|---|---|
| `list_schemas` | 扱える業務文書スキーマの一覧（id + 日本語ラベル）を返す |
| `get_schema` | スキーマ id を指定して JSON Schema 本体（必須項目・型・選択肢）を返す |
| `read_document` | 相対パスの文書を読み、frontmatter / body / 検出スキーマを返す |
| `validate_document` | 既存文書を宣言スキーマで JSON Schema 検証（schema 未宣言は invalid 扱い） |
| `create_document` | 構造化 frontmatter + 本文から新規作成。schema 宣言キーを種別ごとに自動注入。既存パスは上書きしない |
| `update_document` | frontmatter（浅くマージ）／本文を更新。更新後スキーマで再検証し、更新前後の行 diff を返す |
| `search_documents` | 全文クエリ・スキーマ・日付範囲で検索し、path / schema / title / date / 抜粋を返す |
| `read_tsv` | 検証シート（カスタム TSV）のメタ情報・列定義（型 / 必須 / 選択肢）・データ行・列型の検証結果を返す |
| `append_tsv_row` | 検証シートの末尾に 1 行追加。値は列名キーで指定し、未指定の列は空セルのまま |
| `update_tsv_row` | 検証シートの既存 1 行のうち、指定した列だけを差し替える |

対応スキーマ: `invoice/v1` / `spec/v1` / `test-spec/v1` / `db-spec/v1` / `nosql-db-spec/v1` / `api-spec/v1`。

検証シートは Markdown ではなくカスタム TSV（1 レコード = 1 物理行）なので、`read_document` 系ではなく
TSV 系ツールで扱う。行単位で書き込むため、触っていない行は差分に出ない。
列型に反する値は書き込んだうえで `issues` として返す（記入途中の状態を許容するため）。

> **`git_push` は MCP ツールとして提供しない**（push は人間が最終確認する運用のため）。
> **secrets / API キーは MCP サーバーが受け取らない**（人間が直接投入する）。

## ビルド

```bash
pnpm --filter @md-business/mcp-server build
```

`dist/bin.js`（stdio モードの実行エントリ）が生成される。

デスクトップアプリへ同梱する単一ファイルは別コマンドで作る。

```bash
pnpm --filter @md-business/mcp-server bundle
```

`dist-sidecar/sidecar.cjs` が生成される（依存を内包した 1 ファイル。配布物に
node_modules を含めずに済ませるため）。

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

## HTTP モード（アプリ組み込み）

デスクトップアプリは `dist-sidecar/sidecar.cjs` を子プロセスとして起動し、AI
クライアントは `http://127.0.0.1:<port>/mcp` へ bearer トークン付きで接続する。

```bash
node dist-sidecar/sidecar.cjs <workspace> [<接続情報の保存先>]
```

このモードでは MCP 本体が HTTP に乗るため、stdin / stdout は親プロセスとの制御
チャネルとして使う（改行区切りの JSON、1 行 1 メッセージ）。

| 向き | 種別 | 内容 |
|---|---|---|
| 子 → 親 | `ready` | `url` / `port` / `token` / `root`。listen 完了後に 1 度だけ |
| 子 → 親 | `log` | ツール実行 1 件の記録（ツール名・相対パス・成否・時刻） |
| 子 → 親 | `root` | `set-root` を受理し、解決した root を返す |
| 子 → 親 | `error` | 制御行の解釈失敗など。サーバー本体は動き続ける |
| 親 → 子 | `set-root` | ワークスペース root の差し替え |

stdin が閉じるとサイドカーは自分で終了するので、親が落ちても孤児プロセスは残らない。

### 接続情報の保存（トークン / ポート）

第 2 引数（または環境変数 `MD_BUSINESS_MCP_STATE`）に保存先を渡すと、確定した
トークンとポートをその JSON ファイルへ残し、次回起動時に読み直す。AI クライアント
側へ貼った接続設定を、起動のたびに書き直さずに済ませるため。

```json
{
  "token": "<64 桁の 16 進>",
  "port": 51763
}
```

- ファイルは所有者のみ読み書きできる権限（`0600`）で書く。
- 保存先を渡さない・読めない・壊れている場合は、その場でトークンを発行して
  ポートは OS 任せにする（従来どおり起動はできる）。
- 保存済みのポートが他プロセスに使われていたら OS 割当へ切り替え、確定した
  ポートを保存し直す。
- トークンを作り直したいときはこのファイルを消す。次の起動で新しい値になる
  （貼り済みの設定は入れ替えが要る）。

トークンそのものは引数にも環境変数にも載せない（引数はプロセス一覧から見えるため）。
渡すのは保存先のパスだけで、値を知れるのは子プロセスの stdout を読める親と、
ファイルを読める利用者本人に限られる。

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

決定ロジック（diff / search / registry / tools / workspacePath / control）は純関数として単体テスト、SDK 配線は `InMemoryTransport` + `Client` で end-to-end 検証する。バンドル済みサイドカーは実際に子プロセスとして起動するスモークテストで確認する（依存の取りこぼしや CJS/ESM の食い違いは単体テストでは出ないため）。

## 設計メモ

- 検証器は各 schema パッケージの JSON Schema から**実行時に Ajv2020 でコンパイル**する。schema パッケージが公開する standalone compiled validator は bundler / Apps Script 向けで生 Node ESM では解決できないため、MCP（CSP 制約のない Node sidecar）側で runtime Ajv を使う。schema パッケージ自体には手を入れない。
- I/O は `DocumentStore` インターフェース越し。本番は `FileDocumentStore`（node:fs）、テスト・dry-run は `MemoryDocumentStore`。
