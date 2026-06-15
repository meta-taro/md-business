# @md-business/chrome-extension

Markdown ファースト × 業務文書ビューワー（Chrome 拡張・MV3）。
ローカルの `.md` を開いて **適格請求書** として描画し、ブラウザの印刷ダイアログから PDF 保存します。

## できること（Phase 1-MVP）

- ✅ ローカルの `.md` を開く（ポップアップから drag-and-drop / file picker）
- ✅ ローカルの `.md` をブラウザで開いた瞬間に自動レンダ（`file://` ホスト権限・要 chrome://extensions で有効化）
- ✅ frontmatter から `schema:` または `schemaVersion:` を読み取って描画
- ✅ 「PDF として保存」ボタン → ブラウザ印刷ダイアログ
- ✅ SchemaPlugin インタフェースで v1.1+ のテスト設計書・基本仕様書を追加可能

## 開発手順

```bash
# ルートで一回だけ
pnpm install

# 依存パッケージをビルド（最初のみ）
pnpm --filter @md-business/core build
pnpm --filter @md-business/schema-invoice build
pnpm --filter @md-business/renderer-pdf build

# 拡張をビルド（dist/ に出る）
pnpm --filter @md-business/chrome-extension build
```

## Chrome に読み込む（unpacked）

1. Chrome で `chrome://extensions` を開く
2. 右上の「デベロッパー モード」を ON
3. 「パッケージ化されていない拡張機能を読み込む」をクリック
4. `apps/chrome-extension/dist` フォルダを選択
5. （任意）拡張のカードで「ファイルの URL へのアクセスを許可」を ON にすると `file://*.md` を直接開いて自動レンダされます

## 動作確認

```bash
# サンプル md
templates/invoice/standard.md
templates/invoice/inbound-eligible.md
```

1. 拡張のアイコンをクリック → ポップアップが出る
2. `templates/invoice/standard.md` をドロップ
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
│   ├── invoice.ts           # 請求書プラグイン（Phase 1-MVP）
│   └── index.ts             # createDefaultRegistry()
└── shared/
    ├── loadMarkdown.ts      # 純粋ロジック（DOM 非依存・テスト容易）
    └── storage.ts           # chrome.storage.session キー定義
```

依存:

- `@md-business/core` — frontmatter パーサ + JSON Schema 検証（Ajv2020）
- `@md-business/schema-invoice` — 適格請求書 v1 スキーマ
- `@md-business/renderer-pdf` — HTML 描画と `invoice.css`
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

Issue #10 を参照。掲載アイコン・スクリーンショット（1280×800 × 3〜5）・PRIVACY.md は別途準備します。
申請は人間（PdM・Dokokade アカウント）が行います（baseline 項目15）。

## ライセンス

MIT — 詳細はリポジトリルートの [LICENSE](../../LICENSE) を参照。
