# md-business

> Markdown-first business document templates. Specialized viewers for invoices, test specs, design docs across multiple channels.

**md-business** は Markdown ファイル（frontmatter + 本文）をハブにして、業務文書を特化型ビューワー UI で編集・PDF 出力する OSS シリーズです。請求書を起点に、テスト設計書・基本仕様書・見積書などへテンプレを順次拡張します。

各配布チャネル（Google Docs アドオン / Chrome 拡張 / VS Code 拡張 / PWA / LINE LIFF / GitHub Action）にビューワーを載せ、エンジニア・非エンジニア双方に届く形で配布します。

## なぜ Markdown か

- AI（特に Claude / Gemini 等）は Markdown の編集が得意。
- frontmatter は機械可読データ、本文は人間可読プレビューとして両立する。
- GitHub でそのまま読める。
- 環境別エディタ (Word / Excel / 各社 SaaS) のロックインを避けられる。

## やる配布チャネル

| チャネル | 想定ユーザー |
|---|---|
| Google Docs アドオン | 非エンジニア（Docs を開ければ使える） |
| Chrome 拡張 | ブラウザで MD ファイルを開く人 |
| VS Code 拡張 | エンジニア |
| PWA | 環境を選ばない |
| LINE LIFF | 日本のモバイルユーザー |
| GitHub Action | CI で PDF 自動生成したい人 |

## 含まれるテンプレ（順次拡張）

| テンプレ | 状態 |
|---|---|
| 請求書（日本の適格請求書 / インボイス制度対応） | Phase 1 |
| テスト設計書 | Phase 3 |
| 基本仕様書 | Phase 3 |
| 見積書 / 議事録 / 契約書 | Phase 5 |

## 構成

```
md-business/
├── packages/
│   ├── core/                Markdown ⇄ AST パーサ + frontmatter 検証
│   ├── renderer-pdf/        Paged.js（ブラウザ）
│   ├── renderer-typst/      Typst（サーバ・GitHub Action）
│   ├── shared-ui/           Web Components 共通（Lit + Tailwind v4）
│   ├── schema-invoice/      請求書 JSON Schema
│   └── viewer-invoice/      請求書フォーム UI
└── apps/
    ├── pwa/                 Astro 5 + Content Collections
    ├── chrome-extension/    Manifest V3
    ├── docs-addon/          Apps Script + clasp
    ├── vscode-extension/    Content Type 拡張
    ├── line-liff/           LIFF SDK
    └── github-action/       Marketplace 公開予定
```

## Quick Start

```bash
corepack enable
pnpm install
pnpm dev
```

詳細は [CONTRIBUTING.md](./CONTRIBUTING.md) を参照。

## ライセンス

MIT — fork して各社で自由にカスタマイズしてください。本家にマージしない派生（例: `schema-invoice-custom`）も推奨です。

## Status

🚧 **Phase 0: 骨格構築中**（2026-06-12 開始）。Phase 1（請求書 MVP）に向けて開発中。

## Contributing

Issue / PR は歓迎します。新規スキーマ・新規配布チャネルの追加方法は [CONTRIBUTING.md](./CONTRIBUTING.md) を参照してください。
