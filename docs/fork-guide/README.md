# Fork ガイド: 各社カスタム派生の作り方

md-business は MIT ライセンスで配布されており、企業内 / コンサル案件 / 個人事業者向けに **fork してカスタム派生を作る** ことを推奨しています。本ガイドは、fork して安全に運用するための章立てを示します。

> 既に fork を始めている方は、本家 [meta-taro/md-business](https://github.com/meta-taro/md-business) の Issue / Discussions で質問・提案を歓迎します。

## 1. このリポジトリの全体像

- pnpm workspace monorepo（`packages/` + `apps/`）
- 各 `schema-*` パッケージが業務文書の正本 JSON Schema を提供
- `renderer-pdf` が表示・PDF の表現層、`fences` が ```zumen``` / ```chart``` / ```data``` の描画、`explorer` がファイル一覧、`mcp-server` が AI 向けの MCP サーバー
- `apps/desktop`（Tauri）/ `apps/chrome-extension` / `apps/vscode-extension` / `apps/google-workspace-addon` が配信チャネル


## 2. 推奨される fork 戦略

- **企業内利用（社内テンプレート差し替えのみ）**: `templates/<type>/*.md` を上書きする最小 fork。schema は本家追従。
- **コンサル案件（顧客カスタムスキーマ）**: `packages/schema-<custom>/` を新規追加。`@md-business/core/runtime` を依存して `parseAndValidate` を再利用。
- **企業ホワイトラベル（独自ブランド配信）**: `apps/chrome-extension` の `manifest.json` / アイコン / 名称を差し替えて独自ストア公開。本家 schema は引き続き本家追従。


## 3. 上流追従の運用

- `git remote add upstream https://github.com/meta-taro/md-business.git`
- 月次で `git fetch upstream && git rebase upstream/main` を推奨
- 大規模スキーマ変更時は本家 CHANGELOG / Release Notes を参照


## 4. 各サブパッケージのカスタマイズ余地

| パッケージ                  | カスタマイズ余地                                  | 推奨アプローチ                   |
| --------------------------- | ------------------------------------------------- | -------------------------------- |
| `schema-invoice`            | 業種別 frontmatter 追加 / 印影レイアウト          | fork or 派生 schema 新規追加     |
| `schema-spec`               | 業務固有の章立てテンプレ                          | `templates/spec/<業種>.md` 追加  |
| `schema-test-spec`          | 業務固有の列スキーマ拡張                          | frontmatter `columns:` で拡張    |
| `schema-invoice`（表示）    | 印影・ロゴ・テーマカラー差し替え                  | `theme:` frontmatter で対応      |
| `renderer-pdf`              | 用紙サイズ / 余白 / フォント差し替え              | Paged.js CSS の override         |


## 5. 配布チャネル別の注意点

- **Chrome Web Store**: Publisher アカウント取得 ($5) / プライバシーポリシー必須 / 個人開発者でも可
- **Google Workspace Marketplace**: ドメイン認証 + Sensitive scope 検証申請 / 法人アカウント推奨
- **デスクトップアプリ**: 自動更新は `apps/desktop/src-tauri/tauri.conf.json` の `plugins.updater`（公開鍵と配信先）が本家を指している。fork で配るなら自分の署名鍵を作って `pubkey` と `endpoints` を差し替える。そのままだと、fork 版が本家の版へ更新されようとする。署名鍵の秘密側は Repository secrets に置き、リポジトリへ入れない
- **MCP Registry**: リポジトリ直下の `server.json` は本家の名前（`io.github.meta-taro/md-business`）で MCP サーバーを登録する。`.github/workflows/mcp-registry.yml` は本家のリポジトリでしか動かない。fork でも登録するなら `name` と `repository.url` を自分の GitHub 名前空間に変え、ワークフローの `if:` と `scripts/mcp-registry.test.mjs` の期待値も合わせる
- **VS Code Marketplace**: `apps/vscode-extension/package.json` の `publisher` と `name` を自分のものに変える
- **PWA セルフホスト**（計画中）: HTTPS 必須
- **npm 公開**: 各 `@<your-org>/schema-<type>` として個別公開推奨（monorepo 全体公開は非推奨）


## 関連

- [`docs/google-addon-marketplace-listing.md`](../google-addon-marketplace-listing.md) — Workspace Marketplace 申請の素材
- [`docs/google-addon-submit-guide.md`](../google-addon-submit-guide.md) — 提出手順
- [`CONTRIBUTING.md`](../../CONTRIBUTING.md) — 本家への PR ガイド
