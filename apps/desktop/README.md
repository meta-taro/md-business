# @md-business/desktop

md-business の**本命プロダクト**。6 種の業務文書（invoice / spec / test-spec / db-spec / nosql-db-spec / api-spec）を用途別ビューワーで開き、**Markdown を左右 2 画面でライブ編集**しながらプレビュー同期・PDF 出力する Tauri デスクトップアプリ。

デザイン方針・レイアウト・実装フェーズは [`DESIGN.md`](./DESIGN.md) を正本とする。

## ダウンロード（インストール）

最新版のインストーラは **[Releases](https://github.com/meta-taro/md-business/releases/latest)** から入手できる。

- **Windows**: `.msi`（または `.exe` セットアップ）をダウンロードして実行する。現在コード署名は未対応のため、SmartScreen の「発行元不明」警告が出たら「詳細情報」→「実行」で続行する。
- **macOS**: `.dmg` を開き、アプリを Applications へドラッグする。未公証のため初回のみ Finder でアプリを右クリック →「開く」で Gatekeeper を回避する。

一度インストールすれば、以降の新しいバージョンはアプリ内の **ヘルプ →「更新を確認」**、または起動時の自動確認から更新できる（GitHub Releases の署名付き成果物を検証して適用する）。

## AI クライアントと接続する（MCP）

アプリは起動と同時にローカル専用の MCP サーバーを内蔵で立ち上げる。AI クライアントを繋ぐと、いま開いているフォルダの業務文書を読み書きできる。

1. アプリの右サイドパネルを開き、`MCP` タブを選ぶ。
2. 「接続設定を写す」を押す。下記の形の JSON がクリップボードに入る。
3. AI クライアント（Claude Code / Claude Desktop / Cursor / Cline など）の MCP 設定へ貼る。

既に設定を持っていてトークンだけ入れ替えたいときは、隣の「接続トークンを写す」を使う。

```json
{
  "mcpServers": {
    "md-business": {
      "type": "http",
      "url": "http://127.0.0.1:<port>/mcp",
      "headers": { "Authorization": "Bearer <token>" }
    }
  }
}
```

- ポートとトークンはアプリの設定領域（Windows: `%APPDATA%\io.github.meta-taro.mdbusiness\mcp.json` / macOS: `~/Library/Application Support/io.github.meta-taro.mdbusiness/mcp.json`）に保存され、**次に起動しても同じ接続先**になる。一度貼った設定はそのまま使い続けられる。
  - 保存済みのポートが他プロセスに使われていた場合だけ空きポートへ移り、新しい値が保存される（設定を貼り直す）。
  - トークンを作り直したいときは上記ファイルを消してアプリを起動し直す。
- サーバーは `127.0.0.1` にのみ bind し、トークンが一致しない要求は拒否する。同じ PC 上のクライアントからのみ到達できる。
- 操作できる範囲は**アプリで開いているフォルダの中だけ**で、フォルダを切り替えると追従する。ツールの実行履歴は MCP タブに残る。
- AI クライアントが書き込むと、アプリ側のファイル一覧・プレビューも自動で追従する。
- MCP サーバーは付加機能であり、起動できない環境（Node ランタイム未検出など）でも他の機能は通常どおり動く。理由は MCP タブに表示される。

サーバー本体の仕様（提供ツール・制御チャネル）は [`packages/mcp-server/README.md`](../../packages/mcp-server/README.md) を参照。

## 技術スタック

- **Tauri 2**（Rust: ファイル I/O・ローカル Git・フォージ連携・MCP サーバー）
- **SvelteKit**（`adapter-static` / SSR off / SPA）+ **Svelte 5**（runes）
- **CodeMirror 6**（Markdown エディター・chrome-extension と同一版を再利用）
- **renderer-pdf**（`renderXxxBody` の HTML をビューワー / PDF に流用）

## 前提

- Node 24+ / pnpm（monorepo ルールに従う。npm/yarn 禁止）
- Rust toolchain（`cargo` / `rustc`）— Tauri のネイティブ側ビルドに必要
- OS 別の Tauri 前提（WebView2 等）は [Tauri 公式](https://tauri.app/start/prerequisites/) を参照

## 開発コマンド

すべてリポジトリルート、または `apps/desktop` から実行する。

```bash
# 依存インストール（ルートで）
pnpm install

# フロントのみ（ブラウザで確認・Tauri 外）
pnpm --filter @md-business/desktop dev

# デスクトップアプリ起動（Rust ビルド + webview ウィンドウ）
pnpm --filter @md-business/desktop tauri dev

# 型チェック（svelte-check）
pnpm --filter @md-business/desktop typecheck

# フロント本番ビルド（build/ へ静的出力）
pnpm --filter @md-business/desktop build

# デスクトップ配布ビルド
pnpm --filter @md-business/desktop tauri build
```

> `tauri dev` は初回に Rust 依存を大量にコンパイルするため時間がかかる。2 回目以降はインクリメンタル。

## アイコン

`app-icon.png`（1024×1024 プレースホルダ）を入力に `pnpm --filter @md-business/desktop tauri icon ./app-icon.png` で `src-tauri/icons/` を再生成する。正式ブランドアイコン確定後に差し替える。

## ディレクトリ

```
apps/desktop/
├── DESIGN.md            # デザイン正本（§11）
├── src/                 # SvelteKit フロント（routes / lib）
├── src-tauri/           # Tauri（Rust）クレート
│   ├── src/             # main.rs / lib.rs（command 登録は Phase 3-4）
│   ├── capabilities/    # Tauri 2 権限定義
│   ├── icons/           # アプリアイコン一式
│   └── tauri.conf.json  # Tauri 設定（devUrl=1430 / frontendDist=../build）
├── svelte.config.js
└── vite.config.ts       # dev サーバー port 1430 固定
```
