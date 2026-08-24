<!-- prettier-ignore-start -->
# dbboard — 道具カード

> **このファイルは自動同期されます。**直接編集しても次の同期で上書きされます。
> 誤りや古い記述があれば Issue で知らせてください。

複数 DB 対応のデスクトップ DB クライアント。**AI エージェントからは MCP サーバー経由で読む。**
DB のスキーマ確認・SELECT はこの MCP を使い、`psql` / `mysql` を直接叩かない。

- リポジトリ: <https://github.com/meta-taro/dbboard>（MIT）
- ダウンロード: <https://meta-taro.github.io/dbboard/>
- リリース: <https://github.com/meta-taro/dbboard/releases/latest>

## 版数はこのカードに書かない

版数を書くと次のリリースで嘘になる。入手は必ずダウンロードページを開いて、そこに出ている最新を取る。

---

## 1. MCP サーバー（AI エージェントが使うのはこちら）

**バイナリ配布されています。ビルドは不要です。**

| ファイル | 対象 |
|---|---|
| `dbboard-mcp-windows-x86_64.exe` | Windows |
| `dbboard-mcp-macos-universal` | macOS（Intel / Apple Silicon 共通） |
| `SHA256SUMS.txt` | 上記の照合用 |

**デスクトップアプリのインストーラには入っていません。別ダウンロードです。**
ランタイム依存の無い単一実行ファイルで、**デスクトップアプリを入れる必要もありません。**

### ⚠ 自動更新されません（md-business と違うところ）

**`dbboard-mcp` は、コピーした時点の版のまま止まります。**アプリのような自動更新はありません。
しかも**呼んでいるエージェント側からは、古いことが見えません**（dbboard#195）。

- **バイナリを差し替えたら、必ずエージェントを再起動する。**クライアントごとに
  `dbboard-mcp` プロセスを 1 本抱えるので、起動済みのセッションは古いプロセスを掴んだまま
- **「直ったはずの不具合が再現する」ときは、まず手元のバイナリの版を疑う**
- `get_server_info` で今掴んでいるサーバーの情報を取れる

### ⚠ 未署名です

**コード署名・公証を行っていないため、OS が「発行元不明」として止めます。**異常ではありません。
**`SHA256SUMS.txt` と照合してください**（署名の代わりに置いてあるのはこれ）。

### 導入（1 回だけ）

**1. 取得** — ダウンロードページまたは releases から落とす。

**2. 置き場所を固定する**

| OS | 置き場所 |
|---|---|
| Windows | `%LOCALAPPDATA%\dbboard\dbboard-mcp.exe` |
| macOS | `~/.local/bin/dbboard-mcp` |

macOS は未署名ビルドのため、この 2 つが要ります。

```sh
chmod +x ~/.local/bin/dbboard-mcp
xattr -d com.apple.quarantine ~/.local/bin/dbboard-mcp
```

**3. 登録（コピペ 1 行）**

```powershell
claude mcp add dbboard --scope user -- "$env:LOCALAPPDATA/dbboard/dbboard-mcp.exe"
```

```sh
claude mcp add dbboard --scope user -- "$HOME/.local/bin/dbboard-mcp"
```

`--scope user` でマシン上の全プロジェクトから使えます。

**4. エージェントを再起動する。**（**デスクトップアプリの再起動は無関係**。別プロセス）

### 登録（Claude Desktop）

`%APPDATA%\Claude\claude_desktop_config.json`（macOS は
`~/Library/Application Support/Claude/claude_desktop_config.json`）に追記。

```jsonc
{
  "mcpServers": {
    "dbboard": { "command": "C:\Users\<you>\AppData\Local\dbboard\dbboard-mcp.exe" }
  }
}
```

---

## 2. 接続情報の渡し方

既定では dbboard 本体と同じ `connections.toml` ＋ OS キーチェーン
（Windows 資格情報マネージャー / macOS キーチェーン）を読みます。**新しい保管場所は増えません。**

**認証情報をファイルに置けない運用なら、接続を丸ごと環境変数で渡せます。**
MCP エントリの `env` ブロックに置くか、エージェントを起動するシェルで export します。

| 変数 | 対象 |
|---|---|
| `DBBOARD_MYSQL_URL` | MySQL / MariaDB |
| `DBBOARD_PG_URL` / `DBBOARD_NEON_URL` / `DBBOARD_SUPABASE_URL` / `DBBOARD_AURORA_DSQL_URL` | PostgreSQL wire 系 |
| `DBBOARD_TURSO_PATH` | ローカル libSQL / SQLite ファイル |
| `DBBOARD_D1_ACCOUNT_ID` / `_DATABASE_ID` / `_TOKEN` / `_BASE_URL` | Cloudflare D1 |
| `DBBOARD_FIRESTORE_PROJECT_ID` / `_DATABASE_ID` / `_SERVICE_ACCOUNT` / `_BASE_URL` | Cloud Firestore |
| `DBBOARD_MONGODB_URI` / `_DATABASE` | MongoDB |
| `DBBOARD_SSH_HOST` / `_PORT` / `_USER` / `_KEY` / `_KEY_PATH` / `_KEY_PASSPHRASE` / `_PASSWORD` / `_FINGERPRINT` / `_KNOWN_HOSTS` / `_FORWARD_HOST` / `_FORWARD_PORT` | SSH ローカルフォワード |
| `DBBOARD_CONFIG` / `DBBOARD_CONFIG_DIR` / `DBBOARD_CONNECTION` | どの `connections.toml` の、どのエントリを使うか |

環境変数で作った接続はどこにも書き出されず、プロセスと同じ寿命で消えます。
ただし **`~/.claude.json` はディスク上のファイルです。**そこが論点なら、
MCP エントリの `env` ではなくシェル側で export してください。

> **`turso-remote`（ネットワーク越しの libSQL）と `aurora-dsql-iam` には環境変数経路がありません**
> （2026-08-21 実測）。これらは `connections.toml` ＋ キーチェーンで設定します。

**SSH トンネルはホスト鍵検証が必須です。**`DBBOARD_SSH_FINGERPRINT` か
`DBBOARD_SSH_KNOWN_HOSTS` のどちらかを必ず渡します。無検証で通すオプションはありません。
**「トンネルがどうしても繋がらない」ときは、たいていこの 2 つのどちらかが無いだけです。**

---

## 3. 対応している DB（11 種・2026-08-21 実測）

出典: `crates/dbboard-config/src/store.rs` の `enum ConnectionKind`。

| 系統 | kind |
|---|---|
| PostgreSQL wire | `postgres` / `neon` / `supabase` / `aurora-dsql` / `aurora-dsql-iam` |
| MySQL wire | `mysql` |
| libSQL / SQLite | `turso`（ファイル） / `turso-remote`（ネットワーク越し） |
| Cloudflare | `d1` |
| ドキュメント指向 | `firestore` / `mongodb` |

---

## 4. 使えるツール（17 種・2026-08-21 実測）

出典: `crates/dbboard-mcp/src/server.rs` の `#[tool(...)]`。
**以前 Issue で配ったカードには 9 種しか載っていませんでした。**

### DB を読む（7）

`list_connections` / `list_tables` / `describe_table` / `search_schema` /
`list_relationships` / `run_read_query` / `get_annotations`

### DB を書く（1）・バックアップ（1）

`run_write` / `dump_database`

### デスクトップアプリの操作（8）— **配ったカードに載っていなかった部分**

| ツール | 何をする |
|---|---|
| `get_server_info` | 今掴んでいる MCP サーバーの情報。**版ずれの確認に使う** |
| `get_ui_locale` / `set_ui_locale` | アプリの表示言語 |
| `set_editor_sql` | アプリのエディタに SQL を流し込む（**実行はしない**） |
| `run_query` | アプリ側でクエリを実行する |
| `capture_window` | アプリの画面を取る |
| `open_ai_panel` / `open_ai_settings` | アプリの AI パネル・設定を開く |

**これらはデスクトップアプリが動いているときの操作用です。**
人に画面で見てもらう前に `set_editor_sql` で SQL を置いておく、といった使い方ができます。

### 全体の約束

- **既定は読み取り専用。**`run_write` は接続ごとに `mcp_write = true`
  （またはアプリの「AI エージェントに書き込みを許可」トグル）を人間が明示するまで拒否されます
- **読み取りの read-only はエンジン側で強制**されます（Postgres は `BEGIN TRANSACTION READ ONLY`、
  libSQL/Turso は `PRAGMA query_only`、D1 は AST 判定）。文字列マッチではありません
- **フラグを立てても永久に開かないものがあります**: `GRANT` / `REVOKE`、ユーザー・ロール DDL、
  `SET PASSWORD`、`TRUNCATE`、`DROP`（INDEX を除く）。**これらは「設定で開けてもらう」交渉自体が無意味**です
  （`DELETE` は許可され `TRUNCATE` が不可なのは、`DELETE` は `WHERE` を持ち、トランザクションで、
  ダンプで戻せるからです）
- `dump_database` は読み取りのみなのでフラグ不要。**既存ファイルを上書きしません**
- 結果は `max_rows` が上限 1000（既定 200）に丸められ、`truncated` フラグが立ちます
- **接続情報は `{ id, name, kind }` しか送られない。** URL・トークンは MCP を通りません
- 接続の追加・編集・削除、およびリストアは MCP からできません（人間がアプリで行う）

### 実在するホスト名を AI の履歴に残したくない場合

`connections.toml` の接続に `mcp_alias = "store-a"` を設定すると、
エージェントが見る文字列がその別名だけになり、**本来の id は受け付けられなくなります**
（前のセッションで拾った id を使い回すこともできません）。

---

## 5. デスクトップアプリ（人間が見る用）

**既定のインストール先（Windows MSI）**

```
C:\Program Files\dbboard\dbboard.exe
```

Windows `.msi` / `.exe`、macOS `.dmg`。**MCP を使うだけなら不要です。**

---

## 6. 既知エラー（文言そのまま）

### `expected to read 4 bytes, got 0 bytes at EOF`

接続が切れています。**再試行では直りません**（エージェントの再起動が要る）。
2 回試して駄目ならブラウザ経由など別の手段へ切り替えてください。時間の無駄です。

### `schannel: CRYPT_E_NO_REVOCATION_CHECK` / curl が全 HTTPS で `000`

dbboard ではなく Windows の curl 側。失効確認に失敗して**全 HTTPS が落ちます**。
`--ssl-no-revoke` を付ける。「特定のサイトだけ」ではなく「全部 000」になるのが見分け方。

### 企業ネットワーク（TLS 終端プロキシ）配下で証明書エラー

**dbboard 側に渡すフラグはありません。**dbboard は全ての TLS 接続で **OS のトラストストア**を
読むため、マシンがそのプロキシの CA を信用していれば自動的に通ります。
それでも証明書エラーが出るなら、**CA が OS ストアに入っていないということ**です。
dbboard のフラグを探すのではなく、OS 側に CA を入れてください。

> 同じ症状でも **Node 製ツールは事情が違います。**あちらは同梱 CA を見るため
> `NODE_OPTIONS=--use-system-ca` が要ります。dbboard には不要です。混同しないでください。

### 直したはずの不具合が再現する

**手元の `dbboard-mcp` が古いまま止まっている可能性があります**（§1 の自動更新なしを参照）。
バイナリを取り直し、**エージェントを再起動**してから再確認してください。
<!-- prettier-ignore-end -->
