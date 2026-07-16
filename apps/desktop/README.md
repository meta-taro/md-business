# @md-business/desktop

md-business の**本命プロダクト**。6 種の業務文書（invoice / spec / test-spec / db-spec / nosql-db-spec / api-spec）を用途別ビューワーで開き、**Markdown を左右 2 画面でライブ編集**しながらプレビュー同期・PDF 出力する Tauri デスクトップアプリ。

デザイン方針・レイアウト・実装フェーズは [`DESIGN.md`](./DESIGN.md) を正本とする（baseline §11）。

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
│   └── tauri.conf.json  # Tauri 設定（devUrl=1420 / frontendDist=../build）
├── svelte.config.js
└── vite.config.ts       # dev サーバー port 1420 固定
```
