# Project Status — md-business

最終更新: 2026-06-16

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
- 2026-06-15 MV3 CSP 違反の根治: gray-matter → js-yaml 置換、Ajv standalone code-gen 導入、`@md-business/core` を browser-safe / `./runtime` に分割
- 2026-06-15 baseline 項目5 補完: Husky 9 + `.husky/pre-commit`（lint/typecheck/test:run）+ `.husky/pre-push`（build + bundle 走査）+ Vite `EVAL` warning の error 化
- 2026-06-15 Ajv standalone の `require()` 残置（ucs2length / ajv-formats）を build-validate.mjs の後処理で top-level `import * as` に持ち上げ、ブラウザの `ReferenceError: require is not defined` を根治。scan-bundle に `require("...")` 検出（文字列/コメント除外つき）も追加
- 2026-06-16 PDF DL ガイドモーダル実装（A 方針: Chrome 印刷ダイアログ自動起動 + 「送信先=PDFとして保存」案内 + `mdb:pdf-guide-skip` localStorage フラグでスキップ可）
- 2026-06-16 Noto Sans JP / Noto Serif JP を `@fontsource/*` 経由で 9 ファイル同梱。`scripts/post-build.mjs` で `dist/vendor/fonts/` にコピー + `dist/styles/fonts.css` 自動生成。viewer 起動時に `chrome.runtime.getURL` で動的読み込み。`MdBusiness Body` / `MdBusiness Stamp` alias を追加し fork での篆書差し替えに対応
- 2026-06-16 篆書系 OSS フォント調査: 青柳衡山フォント T はカスタムライセンスで再配布不可、JFZSKSealScript は OFL だが日本語非対応 → Noto Serif JP Bold で代替、Phase 1.1 で再評価
- 2026-06-16 ハンコ SVG ジェネレータ実装（`packages/renderer-pdf/src/stamp.ts`）。`stamp.shape: auto` は法人キーワード（株式会社/有限会社/合同会社/合名会社/合資会社 / `(株)` / `㈱` 系）で角印、それ以外は丸印を自動判定。1/2/3/4 字レイアウト分岐、ASCII は横書き 1 行、CJK は縦書き / 田の字。朱色 `#c8161d`、フォントは `MdBusiness Stamp` alias 経由
- 2026-06-16 schema-invoice に `stamp?: { enabled?, shape?, text?, font? }` フィールド追加。Ajv standalone 再ビルド、20 件のハンコテスト追加（renderer-pdf 全 52 tests pass、stamp.ts 98% カバレッジ）

## 進行中

- #10 Chrome Web Store 申請パッケージ準備（**PdM 方針 2026-06-15: 最優先**。理想は審査通った Web Store 版を PdM 業務利用）
- #8 ローカル動作確認: 適格請求書レンダリングまで OK（PdM スクリーンショット確認済 2026-06-15 21:58）。PDF DL ボタン + ハンコ表示の最終確認は PdM 側リロード後待ち（2026-06-16）
- #9 `templates/invoice.example.md` の Issue 仕様（単一ファイル）への寄せ

## 次回 PdM 確認待ち

1. 拡張をリロードしてテンプレ `templates/invoice/standard.md` を開き、ハンコ（株式会社サンプル発行元 → 角印）が朱色で印刷ダイアログプレビュー上に出るか
2. 「PDF をダウンロード」クリック → 案内モーダル → 印刷ダイアログ → 「PDF として保存」で保存できるか
3. 「次回から表示しない」チェック後、2 回目以降モーダルが出ずに直接ダイアログが開くか

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
