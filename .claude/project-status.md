# Project Status — md-business

最終更新: 2026-06-15

## 現在のフェーズ

**Phase 1-MVP: 請求書 md + Chrome 拡張（凝縮スコープ）**

Phase 0 骨格は完了見込み。Phase 1 を MVP に縮約し、2026-06-30 までに Chrome Web Store 申請まで到達することを目標とする。

## 完了

- 2026-06-12 GitHub リポ `meta-taro/md-business` 作成（public + MIT）
- 2026-06-12 Phase 0 骨格焼き込み（pnpm workspace + LICENSE + CI + CLAUDE.md + baseline）
- 2026-06-12 Phase 0 初期 Issue 起票
- 2026-06-14 Phase 1-MVP スコープ確定（請求書 + Chrome 拡張のみ）
- 2026-06-14 Chrome 拡張表示名確定: `md-business: Invoice (適格請求書)`
- 2026-06-14 印影なし方針確定（法的義務なし、CSS で署名欄余白のみ）
- 2026-06-14 各社実データ `.gitignore` 排除運用確定（`/private/` `*.private.md` 等）
- 2026-06-14 Chrome 拡張をスキーマプラグイン構造にし、後の schema 追加で継続アップデート方針
- 2026-06-15 `packages/schema-invoice` 適格請求書 v1 スキーマ実装（#3）
- 2026-06-15 `packages/renderer-pdf` 請求書 HTML レンダラ実装（#5、32 tests、Paged.js 連携）
- 2026-06-15 `apps/chrome-extension` MVP 実装（#8、MV3 + popup + viewer + content script + SchemaPlugin）

## 進行中

- #8 のローカル動作確認（unpacked load → templates/invoice/standard.md → PDF DL）— 人間検証待ち
- #9 `templates/invoice.example.md` の Issue 仕様（単一ファイル）への寄せ
- #10 Chrome Web Store 申請パッケージ準備

## 次タスク（Phase 1-MVP）

1. `packages/core/` 最小実装（frontmatter パーサ + Ajv 検証）
2. `packages/schema-invoice/` 適格請求書 JSON Schema（mkpoli/typst-inboisu 参照）
3. `packages/renderer-pdf/` Paged.js + 日本語フォント埋め込み + A4 縦 + 署名欄余白
4. `apps/chrome-extension/` — `simov/markdown-viewer` fork ベース
   - **スキーマプラグイン構造**（最初は invoice のみ組み込み、後で test-spec / design-doc を追加できる）
   - ポップアップでスキーマ選択（v1 は invoice のみ表示） + md インポート UI + プレビュー + PDF DL
5. `templates/invoice.example.md` 汎用ダミー
6. `private/kingdom-2026-06.md` キングダム社実データ（ignore 対象）で PDF 出力検証
7. `PRIVACY.md` + Chrome Web Store 申請パッケージ
8. ドコカデアカウントから submit（人間操作）

## Chrome 拡張の拡張性方針（重要）

Chrome 拡張は単発リリースで終わらず、md-business シリーズ全体の受け皿として継続アップデートする。

- スキーマレジストリ型: 拡張内で `schema-invoice` `schema-test-spec` `schema-design-doc` 等を切替可能
- ビューワー / レンダラもスキーマごとにプラグインとして差し替え可能
- 新スキーマ追加時は拡張のマイナーアップデートで Chrome Web Store に再 submit
- v1.0.0 (Phase 1-MVP): invoice のみ
- v1.1.0 (Phase 3): test-spec（名前 / 日次チェック OK/NG / 備考欄）/ design-doc 追加
- v1.2.0 (Phase 5): 見積 / 議事録 / 契約 / 履歴

## 将来構想（未決定・Phase 1b 以降で検討）

- **共同編集**: 現状はローカル md 単独編集だが、複数人同時編集を視野に入れる。技術候補は Yjs / Automerge / CRDT。Phase 1b 以降の PWA レイヤに組み込むのが現実的。
- **動作モード**: ローカル単独（Phase 1-MVP）→ クラウド同期（git / Dropbox 経由・Phase 1b）→ リアルタイム共同編集（Phase 2 以降）の段階的展開。
- **ブランチ戦略**: Phase 1-MVP は `main` で走り切る（PdM 指示 2026-06-14）。請求書 md 完成後に Issue 化して決定。候補: Phase 単位 feature ブランチ + PR / Git Flow（main + develop）/ 各社カスタムは fork ベース（decisions.md 既存方針延長）。

## 既知の懸念

- npm scope `@md-business/` の空き未確証 → Phase 3 npm 公開直前に `npm view @md-business/probe` で実機確認
- LINE LIFF の業務文書系 OSS 先行事例なし → Phase 4 で完全新規実装
- Chrome Web Store 審査期間（初回 1〜2 週）→ 6 月分は最悪 PdM 代行でカバー

## 関連

- Roadmap: [./roadmap.md](./roadmap.md)
- Decisions: [./decisions.md](./decisions.md)
- baseline: [./rules/product-baseline.md](./rules/product-baseline.md)
