# CLAUDE.md — md-business

このリポジトリは **md-business**（Markdown ファースト × 特化ビューワー × 配布チャネル多様性の OSS シリーズ）です。

このファイルは Claude Code が本リポで作業する際の指示書です。

## プロダクト概要

- Markdown ファイル（frontmatter + 本文）をハブにして業務文書を編集・PDF 出力する OSS シリーズ
- 請求書 → テスト設計書 → 基本仕様書 → ... と順次スキーマを追加
- 6 配布チャネル: Google Docs アドオン / Chrome 拡張 / VS Code 拡張 / PWA / LINE LIFF / GitHub Action
- ライセンス: MIT
- fork して各社カスタムを作る前提

詳細は [README.md](./README.md) と [CONTRIBUTING.md](./CONTRIBUTING.md) を参照。

## 構成

- `packages/` — コア・スキーマ・ビューワー・レンダラ
- `apps/` — 各配布チャネル
- `templates/` — サンプル Markdown
- `docs/` — 仕様書・コントリビューター手引き
- `.claude/` — Claude Code 用の作業状態（project-status / roadmap / decisions / issues）
- `.claude/rules/product-baseline.md` — **必読**。全プロダクト共通の作業ルール正本。

## モノレポ運用

- pnpm workspace + Turborepo
- 各パッケージは `@md-business/<name>` で npm 公開予定（Phase 3）
- セマンティックバージョン管理は changesets

## 作業時の基本動作

1. **セッション開始時** に `git pull --ff-only` し、open Issue を確認（baseline 項目18）
2. 実装前に `.claude/roadmap.md` と `.claude/decisions.md` を確認
3. テストファースト（baseline 項目4）
4. **commit は AI / push は人間**（baseline 項目6）
5. 進捗記録は `.claude/project-status.md` を最新化

## 重要な決定（詳細は `.claude/decisions.md`）

- PDF レンダラは 2 系統並立: ブラウザ = Paged.js / サーバ = Typst
- 請求書テンプレは `mkpoli/typst-inboisu`（日本の適格請求書対応 OSS）を参照源として利用
- VS Code 拡張は `estruyf/vscode-front-matter` の Content Type 拡張ベース
- Chrome 拡張は `simov/markdown-viewer` fork ベース
- UI は Lit Web Components + Tailwind CSS v4
- 配布リポ担当者への外部委譲なし。本リポは PdM セッションで OSS として開発

## やらない（明示）

- Obsidian / Logseq プラグイン
- Microsoft Word アドイン
- 汎用ドキュメントエディタ化（特化ビューワーを並べる方針）
- バックエンドサーバ常駐
- ユーザー認証・課金

## OSS 運営

- Contributor 受け入れ: Issue / PR ベース
- 各社カスタムは fork → `schema-*-custom` 派生を推奨。本家にマージしない
- Code of Conduct: Contributor Covenant v2.1（[CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)）
