# Roadmap — md-business

詳細は司令塔リポ側の `projects/md-business/roadmap.md` が正本。本ファイルは配布リポでの作業時参照用ミラー。

## フェーズ俯瞰

| Phase | スコープ | 完了条件 |
|---|---|---|
| **0** | 骨格構築・LICENSE / README / CLAUDE.md / baseline 焼き込み | `pnpm install` 成功・空の packages/apps が並ぶ |
| **1** | 請求書 MVP（core + schema-invoice + viewer-invoice + renderer-pdf + apps/pwa） | PWA で frontmatter 編集 → PDF ダウンロードが動く |
| **2** | 配布チャネル展開 a（Chrome 拡張 + Google Docs アドオン） | Chrome Web Store / Workspace Marketplace に submit |
| **3** | テンプレ拡張（schema-test-spec + schema-design-doc）+ npm 公開 | `@md-business/*` が npm published |
| **4** | 配布チャネル展開 b（VS Code 拡張 + LINE LIFF + GitHub Action） | 各 Marketplace に submit |
| **5** | テンプレ拡張 b（見積書 / 議事録 / 契約書 / 履歴書）+ fork-guide 整備 | コミュニティ contributor 受け入れ態勢 |

## Phase 1 内訳

- `packages/core/` — frontmatter パーサ（gray-matter）+ JSON Schema 検証（Ajv）+ remark
- `packages/schema-invoice/` — 適格請求書 JSON Schema（T 番号・税率別小計）
- `packages/viewer-invoice/` — Lit Web Component（frontmatter ⇔ form 双方向）
- `packages/renderer-pdf/` — Paged.js（日本語フォント・A4 縦）
- `apps/pwa/` — Astro 5 + Astro Content Collections + Cloudflare Pages

## 横断原則

- baseline `./rules/product-baseline.md` に準拠
- 各 Phase の commit は AI、push は人間（PdM）最終確認
- 既存 OSS 利用時は LICENSE 互換を確認・帰属を明記
