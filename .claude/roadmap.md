# Roadmap — md-business

詳細は司令塔リポ側の `projects/md-business/roadmap.md` が正本。本ファイルは配布リポでの作業時参照用ミラー。

## フェーズ俯瞰

| Phase | スコープ | 完了条件 | 目安期間 | 想定完了 |
|---|---|---|---|---|
| **0** | 骨格構築・LICENSE / README / CLAUDE.md / baseline 焼き込み | `pnpm install` 成功・空の packages/apps が並ぶ | 〜1 週 | 2026-06 中旬（ほぼ完了） |
| **1-MVP** | 請求書 md + Chrome 拡張（インポート → プレビュー → PDF DL） + 適格請求書 schema + キングダム社向け運用開始 | Chrome Web Store 申請完了・PDF DL 動作 | 〜2.5 週 | **2026-06-30** |
| **1b** | `viewer-invoice`（Lit + フォーム UI 双方向バインド）+ `apps/pwa`（Astro 5 + Cloudflare Pages） | PWA で frontmatter 編集 → PDF DL | 3〜4 週 | 2026-07 末〜08 上旬 |
| **2** | 配布チャネル展開 a（Google Docs アドオン） | Workspace Marketplace に submit | 3〜4 週 | 2026-08 末〜09 上旬 |
| **3** | テンプレ拡張（schema-test-spec + schema-design-doc）+ npm 公開 | `@md-business/*` が npm published | 2〜3 週 | 2026-09 末 |
| **4** | 配布チャネル展開 b（VS Code 拡張 + LINE LIFF + GitHub Action） | 各 Marketplace に submit | 4〜5 週 | 2026-10 末〜11 上旬 |
| **5** | テンプレ拡張 b（見積書 / 議事録 / 契約書 / 履歴書）+ fork-guide 整備 | コミュニティ contributor 受け入れ態勢 | 4〜6 週 | 2026-12 中旬 |

## Phase 1-MVP 内訳（2026-06 凝縮）

PdM 指示により、Phase 1 を MVP（請求書 md + Chrome 拡張のみ）に縮約。フォーム UI と PWA は Phase 1b へ移送。
Chrome 拡張は **md-business シリーズ全体の受け皿** として継続アップデートする前提で、スキーマプラグイン構造で実装する。

- `packages/core/` — frontmatter パーサ（gray-matter）+ JSON Schema 検証（Ajv）+ remark（最小構成）
- `packages/schema-invoice/` — 適格請求書 JSON Schema（T 番号・税率別小計・受領者名・取引年月日 等の必須 7 項目）
- `packages/renderer-pdf/` — Paged.js（日本語フォント埋め込み・A4 縦・印影なし／署名欄余白のみ）
- `apps/chrome-extension/` — `simov/markdown-viewer` fork ベース
  - スキーマレジストリ型（Phase 1-MVP は `invoice` のみ組み込み）
  - ポップアップで「スキーマ選択 → md インポート → プレビュー → PDF DL」
  - 後の Phase で `test-spec` / `design-doc` 等をマイナーアップデートで追加可能
- `templates/invoice.example.md` — OSS 公開用ダミー（汎用）
- `private/kingdom-2026-06.md` — キングダム社実データ（`.gitignore` で本家から排除）
- `PRIVACY.md` — Chrome Web Store 申請用（データ収集なし宣言）

## Chrome 拡張のバージョン展望

| 拡張バージョン | リリース時期 | 対応スキーマ |
|---|---|---|
| v1.0.0 | 2026-06 末（Phase 1-MVP） | `invoice`（請求書） |
| v1.1.0 | 2026-09 末（Phase 3） | `invoice` + `test-spec` + `design-doc` |
| v1.2.0 | 2026-12 中旬（Phase 5） | + `quotation` / `meeting-minutes` / `contract` / `resume` |

### Phase 1-MVP 週次スケジュール

| 期間 | 作業 |
|---|---|
| 6/14-21 | Chrome 拡張本体 fork + Paged.js 組み込み + 適格請求書 schema 確定 + 請求書 CSS テンプレ |
| 6/22-27 | キングダム社実データ（private/ ignore）で PDF 出力検証・税率別小計・登録番号レイアウト確認 |
| 6/28-30 | Chrome Web Store 申請パッケージング（PRIVACY.md・スクショ・説明文）→ ドコカデアカウントで submit |
| 7/初旬 | 審査待ち（通常 1〜2 週、初回はやや長め）→ 通り次第 業務委託エンジニアへ引き渡し |

**6 月分請求書のバックアップ**: 審査・開発が間に合わなければ PdM 代行（既存手段）でカバー。

## Phase 1b 以降（Phase 1-MVP 完了後）

- `packages/viewer-invoice/` — Lit Web Component + Tailwind v4 + frontmatter ⇔ form 双方向バインド + バリデーション + Storybook
- `apps/pwa/` — Astro 5 + Astro Content Collections + viewer-invoice 埋め込み + Cloudflare Pages

## 将来構想（未決定）

- **共同編集**: ローカル md 単独編集（Phase 1-MVP）→ クラウド同期（git / Dropbox 経由・Phase 1b）→ リアルタイム複数人同時編集（Phase 2 以降）への段階的展開を視野に。
- **共同編集技術候補**: Yjs / Automerge / CRDT 系を Phase 1b 以降の PWA レイヤに組み込み検討。Chrome 拡張側は引き続きローカル md の閲覧 / PDF DL に専念。

## 横断原則

- baseline `./rules/product-baseline.md` に準拠
- 各 Phase の commit は AI、push は人間（PdM）最終確認
- 既存 OSS 利用時は LICENSE 互換を確認・帰属を明記
- 各社実データは `.gitignore` で本家から排除（`/private/` `*.private.md` 等）
