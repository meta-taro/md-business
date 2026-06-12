# Contributing to md-business

## 開発環境

必要なもの:
- Node.js 24 LTS 以上
- pnpm（`corepack enable` で有効化）
- Git

```bash
git clone https://github.com/meta-taro/md-business.git
cd md-business
corepack enable
pnpm install
```

## 設計原則

- **Markdown ファースト**: 原本は常に `.md`。frontmatter = 機械可読、本文 = 人間可読プレビュー。
- **特化ビューワー**: 汎用性を求めない。請求書専用・テスト設計書専用・基本仕様書専用…と並べる。
- **スキーマ + ビューワーは 1:1**: `schema-invoice` ⇔ `viewer-invoice` のペアで追加。
- **配布チャネル多様性**: 1 つのコアを Google Docs / Chrome / VS Code / PWA / LIFF / GitHub Action に載せる。
- **fork 容易**: 各社カスタマイズは fork → `schema-*-custom` 派生で対応。本家にマージしない。

## 新規スキーマ追加手順

新しい業務文書テンプレを追加する場合は、以下 3 つを 1 セットで作成します:

```
packages/schema-<name>/         JSON Schema + frontmatter 規約
packages/viewer-<name>/         フォーム UI（Lit Web Component）
templates/<name>/standard.md    サンプル Markdown
```

### Step 1: スキーマ定義

`packages/schema-<name>/src/schema.json` に JSON Schema を記述します。frontmatter の構造を機械可読に定義します。

### Step 2: ビューワー実装

`packages/viewer-<name>/src/` に Lit Web Component を実装します。`<viewer-<name>>` タグで埋め込めるようにします。frontmatter ⇔ form state の双方向バインドを担当します。

### Step 3: サンプル作成

`templates/<name>/standard.md` にサンプル Markdown を配置します。frontmatter + 本文プレビューが両方含まれるようにします。

### Step 4: docs/spec/<name>-v1.md

スキーマ仕様書を書きます。バージョニング・互換性ポリシー・必須/オプション項目の説明など。

### Step 5: 各 apps への組み込み

`apps/pwa/`、`apps/chrome-extension/` 等に `<viewer-<name>>` のルートを追加します。

## 新規配布チャネル追加手順

```
apps/<channel-name>/
```

以下の構成を満たすこと:
- 既存の `packages/viewer-*` を再利用する（チャネル別に viewer を作り直さない）
- README.md にインストール方法とビルド方法を書く
- 該当 Marketplace への submit 手順は `docs/release/<channel>.md` に残す

## コミット規約

```
<type>: <description>

<body>
```

`type` は: `feat` / `fix` / `refactor` / `docs` / `test` / `chore` / `perf` / `ci`

## PR チェックリスト

- [ ] CI（lint / typecheck / test / build）が green
- [ ] テストを追加した（または不要な理由を PR 説明に書いた）
- [ ] スキーマ変更時は `docs/spec/` の該当ファイルを更新した
- [ ] changeset を追加した（`pnpm changeset`）

## fork して各社カスタムを作る場合

このリポジトリは MIT ライセンスで、fork による派生は歓迎です。例:

```
# 例: 自社用の請求書スキーマを派生
packages/schema-invoice-acme/
packages/viewer-invoice-acme/
```

本家には派生をマージせず、各社の fork で運用してください。本家は「汎用性を求めず特化を守る」方針で維持します。

詳細は [docs/fork-guide/](./docs/fork-guide/) を参照（Phase 5 で整備予定）。
