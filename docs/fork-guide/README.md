# Fork ガイド: 各社カスタム派生の作り方

md-business は MIT ライセンスで配布されており、企業内 / コンサル案件 / 個人事業者向けに **fork してカスタム派生を作る** ことを推奨しています。本ガイドは、fork して安全に運用するための章立てを示します。

> ⚠️ 本ドキュメントは **章立てのみ** の placeholder です。詳細は Phase 5（OSS コミュニティ拡張フェーズ）で順次拡充します（Issue #7）。
>
> 既に fork を始めている方は、本家 [meta-taro/md-business](https://github.com/meta-taro/md-business) の Issue / Discussions で質問・提案を歓迎します。

## 1. このリポジトリの全体像

- pnpm workspace monorepo（`packages/` + `apps/`）
- 各 `schema-*` パッケージが業務文書の正本 JSON Schema を提供
- 各 `viewer-*` / `renderer-*` が表現層
- `apps/chrome-extension` / `apps/google-workspace-addon` / `apps/pwa` が配信チャネル

→ Phase 5 でアーキテクチャ図と依存関係を追記予定。

## 2. 推奨される fork 戦略

- **企業内利用（社内テンプレート差し替えのみ）**: `templates/<type>/*.md` を上書きする最小 fork。schema は本家追従。
- **コンサル案件（顧客カスタムスキーマ）**: `packages/schema-<custom>/` を新規追加。`@md-business/core/runtime` を依存して `parseAndValidate` を再利用。
- **企業ホワイトラベル（独自ブランド配信）**: `apps/chrome-extension` の `manifest.json` / アイコン / 名称を差し替えて独自ストア公開。本家 schema は引き続き本家追従。

→ Phase 5 で各戦略のサンプル PR / fork サンプルリポを追加予定。

## 3. 上流追従の運用

- `git remote add upstream https://github.com/meta-taro/md-business.git`
- 月次で `git fetch upstream && git rebase upstream/main` を推奨
- 大規模スキーマ変更時は本家 CHANGELOG / Release Notes を参照

→ Phase 5 で実例コマンド・コンフリクト回避パターンを追記予定。

## 4. 各サブパッケージのカスタマイズ余地

| パッケージ                  | カスタマイズ余地                                  | 推奨アプローチ                   |
| --------------------------- | ------------------------------------------------- | -------------------------------- |
| `schema-invoice`            | 業種別 frontmatter 追加 / 印影レイアウト          | fork or 派生 schema 新規追加     |
| `schema-spec`               | 業務固有の章立てテンプレ                          | `templates/spec/<業種>.md` 追加  |
| `schema-test-spec`          | 業務固有の列スキーマ拡張                          | frontmatter `columns:` で拡張    |
| `viewer-invoice`            | 印影・ロゴ・テーマカラー差し替え                  | `theme:` frontmatter で対応      |
| `renderer-pdf`              | 用紙サイズ / 余白 / フォント差し替え              | Paged.js CSS の override         |

→ Phase 5 で各パッケージの拡張ポイント一覧を追加予定。

## 5. 配布チャネル別の注意点

- **Chrome Web Store**: Publisher アカウント取得 ($5) / プライバシーポリシー必須 / 個人開発者でも可
- **Google Workspace Marketplace**: ドメイン認証 + Sensitive scope 検証申請 / 法人アカウント推奨
- **PWA セルフホスト**: HTTPS 必須 / Astro 5 ビルド済み静的サイト
- **npm 公開**: 各 `@<your-org>/schema-<type>` として個別公開推奨（monorepo 全体公開は非推奨）

→ Phase 5 で申請手順 / 提出素材テンプレを追加予定。

## 関連

- [`docs/google-addon-marketplace-listing.md`](../google-addon-marketplace-listing.md) — Workspace Marketplace 申請の素材
- [`docs/google-addon-submit-guide.md`](../google-addon-submit-guide.md) — 提出手順
- [`CONTRIBUTING.md`](../../CONTRIBUTING.md) — 本家への PR ガイド
