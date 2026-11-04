# @md-business/chrome-extension

Markdown ファースト × 業務文書ビューワー（Chrome 拡張・MV3）。
ローカルの `.md` を開いて業務文書として描画し、ブラウザの印刷ダイアログから A4 の PDF に保存します。

## できること

- ローカルの `.md` を開く（ポップアップへドロップ / ファイル選択 / テンプレートから始める）
- `file://` の `.md` をブラウザで開いた瞬間に描画（拡張のカードで「ファイルの URL へのアクセスを許可」を ON）
- frontmatter から書式を判定して描画する。扱える書式:
  - 適格請求書（見積書・領収書を含む）
  - 基本設計書
  - 検証シート（Markdown 系統）
  - DB 設計書（RDB / NoSQL）
  - API 仕様書
  - 調査報告書
- Mermaid 図と構成図（` ```zumen `）を描く
- 書き換えた内容をファイルへ保存（Ctrl+S / Ctrl+Shift+S）
- 「PDF として保存」→ 印刷ダイアログ

### できないこと

- グラフ（` ```chart `）とデータ（` ```data `）の囲みは描かない。どちらも隣のファイルを読む指定で、拡張は開いた 1 枚しか受け取らないため。囲みの位置に理由を出す。デスクトップアプリか VS Code 拡張で開けば描ける。
- 検証シートの TSV 系統（`.tsv`）は扱わない。デスクトップアプリか VS Code 拡張で開く。

## 開発手順

```bash
# ルートで一回だけ
pnpm install

# 拡張をビルド（依存パッケージもまとめてビルドされ、dist/ に出る）
pnpm turbo run build --filter @md-business/chrome-extension
```

## Chrome に読み込む（unpacked）

1. Chrome で `chrome://extensions` を開く
2. 右上の「デベロッパー モード」を ON
3. 「パッケージ化されていない拡張機能を読み込む」をクリック
4. `apps/chrome-extension/dist` フォルダを選択
5. （任意）拡張のカードで「ファイルの URL へのアクセスを許可」を ON にすると `file://*.md` を直接開いて自動レンダされます

## 動作確認

サンプル `.md` はリポジトリ同梱の `templates/invoice/` から取得できます。
ローカルクローンしている場合は相対パス、ブラウザで直接ダウンロードする場合は
以下の GitHub Raw URL から保存してください（Chrome Web Store 審査者向け）:

| テンプレ | 内容 | Raw URL |
|---|---|---|
| `standard-ja.md` | 日本語フィールド名・適格請求書（推奨） | <https://raw.githubusercontent.com/meta-taro/md-business/main/templates/invoice/standard-ja.md> |
| `standard.md` | 英語フィールド名・標準請求書 | <https://raw.githubusercontent.com/meta-taro/md-business/main/templates/invoice/standard.md> |
| `inbound-eligible.md` | 英語フィールド名・軽減税率（8%）込み | <https://raw.githubusercontent.com/meta-taro/md-business/main/templates/invoice/inbound-eligible.md> |

1. 拡張のアイコンをクリック → ポップアップが出る
2. 上記いずれかの `.md` をドロップ（または popup の「テンプレートから始める」ボタンを 1 クリック）
3. 新しいタブに請求書が描画される
4. 「PDF として保存」ボタン → 印刷ダイアログ → 「PDF に保存」

## アーキテクチャ

```
src/
├── content/file-md.ts       # file:// で .md を開いた瞬間に viewer へ転送
├── popup/                   # 拡張アイコン押下時のポップアップ UI
├── viewer/                  # 拡張ページ。md → 検証 → 描画 → PDF DL
├── plugins/
│   ├── types.ts             # SchemaPlugin インタフェース
│   ├── registry.ts          # frontmatter から該当プラグインを解決
│   ├── invoice.ts           # 請求書（見積書・領収書を含む）
│   ├── spec.ts              # 基本設計書
│   ├── test-spec.ts         # 検証シート（Markdown 系統）
│   ├── db-spec.ts / nosql-db-spec.ts / api-spec.ts
│   ├── investigation.ts     # 調査報告書
│   └── index.ts             # createDefaultRegistry()
└── shared/
    ├── loadMarkdown.ts      # 純粋ロジック（DOM 非依存・テスト容易）
    ├── fences.ts            # 図・データ・構成図の囲みを描く前処理
    └── storage.ts           # chrome.storage.session キー定義
```

依存:

- `@md-business/core` — frontmatter パーサ + JSON Schema 検証（Ajv2020）
- `@md-business/schema-*` — 書式ごとの JSON Schema と正規化
- `@md-business/fences` — 図・データ・構成図の囲み（デスクトップアプリ・VS Code 拡張と共通）
- `@metataro/zumen` — 構成図の描画（使うときだけ読み込む）
- `@md-business/renderer-pdf` — 書式ごとの HTML 描画と CSS
- `pagedjs` — `@page` ルールとページネーション（vendor/ に同梱）

## SchemaPlugin を追加する

```ts
import type { SchemaPlugin } from './types.js';

export const designDocPlugin: SchemaPlugin<DesignDoc> = {
  id: 'design-doc',
  label: '基本仕様書',
  schema: designDocSchema,
  stylesHref: 'styles/design-doc.css',
  render: (fm) => renderDesignDocBody(fm),
  documentTitle: (fm) => `基本仕様書 ${fm.documentNumber}`,
};
```

`src/plugins/index.ts` の `createDefaultRegistry()` に `registry.register(designDocPlugin)` を追加するだけで Popup のセレクタにも表示されます。

## Chrome Web Store 提出（参考）

提出用 zip は `pnpm release` で `release/` に出ます（バージョンを上げるときは `pnpm release:minor` など）。
申請はパブリッシャーアカウントを持つ人間が行います。

## ライセンス

MIT — 詳細はリポジトリルートの [LICENSE](../../LICENSE) を参照。
