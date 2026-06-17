# Project Status — md-business

最終更新: 2026-06-17（v0.2.0 renderer-pdf に spec レイアウト追加、106 tests pass）

## 現在のフェーズ

**Phase 1-MVP リリース完了 → Chrome Web Store 審査中**

2026-06-16 にドコカデ Inc. アカウントで v0.1.0 を submit（後で公開モード、審査通過後 30 日以内に手動公開）。審査結果待ちと並行して、UX 改善 patch（v0.1.1）と基本設計書スキーマ minor（v0.2.0）の設計を進める。

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
- 2026-06-16 schema-invoice v0.2: 日本語 frontmatter キー（請求書番号/発行日/発行元/請求先/品目/振込先/印影/丸め/ファイル名）対応、normalize+autofill 2 段、autofill で taxSummary/totals を items[] から自動計算（既定丸め floor、適格請求書 B2B 慣行）。`templates/invoice/standard-ja.md` 追加。`schema-invoice` 全 45 tests pass、branch 84.48%
- 2026-06-16 PDF 保存ファイル名のテンプレート指定対応（`fileName: "御請求書_{請求先}{敬称}_{発行元}_{YMD}"` のような token 展開、Windows 禁止文字をサニタイズ）。viewer は `window.print()` 直前に `document.title` を差し替え、終了後復元
- 2026-06-16 バリデーションエラーの日本語化・可視化。`packages/schema-invoice/src/translateError.ts` で path × keyword を日本語ラベル（「請求先の名前は必須項目です」「発行元の登録番号: T で始まる 13 桁の数字…」等）に翻訳。Chrome 拡張 viewer に warning バナー（黄）/ error 構造化リスト（赤）を追加。`@md-business/core` の `ValidationResult` に warnings を任意プロパティとして拡張。`schema-invoice` 全 69 tests + chrome-extension 全 14 tests pass
- 2026-06-16 請求書レイアウト圧縮 + 空行パディング。CSS の余白 / フォントを 15〜25% 圧縮、`renderInvoiceBody` に `minItemRows`（既定 5）を追加し品目が少ない場合は空行で埋める。3 項目で 2 ページ目に溢れていた問題を解消。renderer-pdf 全 57 tests pass
- 2026-06-16 viewer を split-pane 化（左 CodeMirror 6 エディタ / 右ライブプレビュー iframe）。`previewMarkdown()` を新設し validation 失敗時も `withPreviewDefaults` で構造を補って描画継続、エラーは右パネルバッジ + 入力中はブロックしない。PDF DL ボタン押下時のみ strict 検証 → 失敗ならエラーバナー、合格なら iframe で Paged.js を読み込んで `iframe.contentWindow.print()`。Paged.js を iframe に隔離してツールバー / モーダルを破壊しない構造。chrome-extension 全 27 tests pass、branch カバレッジ 84.33%
- 2026-06-16 frontmatter に `theme`（青/赤/黄/橙/紫/黒/灰 のプリセット or `#RRGGBB`）と `logo`（`data:image/{png,jpeg,gif,webp};base64,...` or `https://...`）対応。CSS 変数 `--mdb-color-accent` を `.mdb-invoice` の inline style で上書き、ロゴは発行元当事者ブロック上部に `max-height:14mm` で表示。テーマ色は `resolveThemeColor` で preset/hex のみ受け付け、ロゴは regex 厳格ホワイトリスト（XSS / CSS injection 防御）
- 2026-06-16 印影で姓名間の空白を除去する fix（`extractStampChars` で `\s+` 除去）。「山田 太郎」が `['山','田',' ','太']` になり 4 文字目「郎」が落ちていた事象を修正。renderer-pdf 全 77 tests pass、stamp.ts 98% カバレッジ
- 2026-06-16 Chrome 拡張 release zip 生成スクリプト（`apps/chrome-extension/scripts/make-release.mjs`）。Pure Node zlib + 自前 CRC32 + ZIP local header / central directory / EOCD 実装。source-map / OS junk / `.zip` / `.crx` を除外、`dist/` の中身を archive root に展開。`pnpm release` で `release/md-business-v<version>.zip` を出力
- 2026-06-16 Web Store 用スクリーンショット 3 枚を 1280x800 / 24bit PNG (アルファなし) に letterbox 変換（Pillow、横 1280 fit + 上下白帯、Lanczos resampling）。`release/screenshots/webstore-1280x800-{1,2,3}.png`
- 2026-06-16 Chrome 拡張 manifest 権限を実使用に合わせて最小化（`storage` のみ）。`activeTab` / `scripting` は実コードで未使用のため削除、申請フォームの理由欄削減 + 最小権限原則準拠
- 2026-06-16 `PRIVACY.md` 追加（ゼロデータ収集宣言、`chrome.storage.session` 使用範囲明記、リモートコード不使用宣言）。Web Store の Privacy Policy URL は GitHub blob 直リンクを登録
- 2026-06-16 Chrome Web Store 申請完了（v0.1.0、ドコカデ Inc. アカウント、後で公開モード）。審査結果待ち
- 2026-06-16 サンプル md（`private/sample-contractor-invoice.md`、業務委託エンジニア → ドコカデ宛、4 品目 ¥616,000、テーマ青、丸印）を Web Store スクリーンショット用に生成
- 2026-06-16 v0.1.1 patch 実装完了・push 済（`343f5e3` `5f7c725`）。popup「テンプレートから始める」3 ボタン（standard-ja / standard / inbound-eligible）+ `dist/templates/` 同梱 + `scripts/bump-version.mjs`（厳格 SemVer + lib/version.ts 分離で vitest 透過）+ `manifest.json`/`package.json` 同期 bump + `chrome.runtime.getURL()` + `web_accessible_resources` 追加。chrome-extension 36 tests pass（うち bumpVersion 9 件）、217 tests 継続
- 2026-06-16 `apps/chrome-extension/README.md` に Chrome Web Store 審査者向けサンプル md の GitHub Raw URL 表（standard-ja / standard / inbound-eligible）を追記
- 2026-06-16 `feat/v0.2.0` ブランチ作成（main 温存）。`packages/schema-invoice` / `plugins/invoice.ts` / `renderer-pdf/src/template.ts` の invoice 系・`manifest.json` の version を触らない方針を Issue 001 に明記
- 2026-06-16 v0.2.0 設計合意 Issue 起票（`.claude/issues/001-v0.2.0-schema-spec.md`）。並行 Explore で SDD テンプレ事例（MADR / arc42 / Google Design Docs）+ Mermaid/SVG/MV3 ライブラリ選定を調査、Issue に反映
- 2026-06-16 v0.2.0 B 案（章ツリー）を **B1 単一 md + B3 chapters: 明示参照** 併用で確定。A 案（ファイル名 prefix 順序制御）は人間負担で不採用、API 仕様書（v0.4.0+）も同じ C 哲学（インデックス + 明示参照）で行く方針確定
- 2026-06-17 Issue #12（baseline 1 違反疑い）調査・解決。`pnpm-workspace.yaml` の `onlyBuiltDependencies: []` / `minimumReleaseAge: 1440` は正常動作（`pendingBuilds: []` + install ログ無 postinstall）。`pnpm config get` は npm 互換 global config のみ読む仕様で workspace settings は見ないため未定義は誤検知。CI に install ログ grep 検証ステップを追加し将来の退行を検出（c53de03）
- 2026-06-17 `templates/spec/standard-ja.md` 追加（EC 注文管理サブシステム基本設計書、8 章 / Mermaid 図 4 種 / 表 49 行 / A4 横 6 ページ想定 / 日本語 frontmatter A 案）。v0.2.0 設計合意の数ページ評価用サンプル（16410e7）
- 2026-06-17 `packages/schema-spec/` 骨格実装。JSON Schema draft 2020-12（required: schemaVersion/documentNumber/title/version/issueDate/status/authors、SemVer pattern、ISO date format、`.md` chapters pattern、additionalProperties: false）+ TypeScript 型 + 日本語キー dictionary（root + party scope、status/toc/theme 値翻訳）+ Ajv standalone build。44 tests pass（schema 14 + normalize 30）、coverage 100% lines / 94.87% branches
- 2026-06-17 `packages/schema-spec` 完成度向上: autofill（schemaVersion / version=0.1.0 / status=draft / toc=auto デフォルト、toc=manual で chapters 空時の警告、toc=auto と chapters 同時指定の mixed signal 警告）+ translateError（Ajv エラー / normalize / autofill 警告を日本語化、SemVer / `.md` / YYYY-MM-DD ヒント、enum 許可値を明記）+ parseSpec（splitFrontmatter → normalize → autofill → validateWithCompiled の MV3 CSP セーフな End-to-End）+ fileName（`{文書番号} / {タイトル} / {版} / {ステータス} / {発行日YMD} / {YMD}` token、Windows 禁止文字サニタイズ、デフォルト `基本設計書_{文書番号}_v{版}`）。96 tests pass（schema 14 + normalize 30 + autofill 10 + translateError 21 + fileName 14 + parseSpec 7）、coverage 99.52% lines / 82.57% branches
- 2026-06-17 `packages/renderer-pdf` に基本設計書レイアウト追加。`renderSpecBody(spec, options)` で表紙ページ（タイトル / ステータスバッジ / 文書番号 / 版 / 発行日 / 作成者 / レビュアー / 関連文書、テーマアクセントカラー、左端 6mm カラーバー）+ `renderSpecHtml(spec, options)` フル HTML 文書ラッパ + `src/styles/spec.css`（A4 縦、表紙 page-break-after、h1 章ごと page-break-before、h2 左ボーダー、テーブル / コードブロック / Mermaid コンテナ / 引用 / 画像スタイル）。`bodyHtml` は viewer 側責務（chrome-extension の plugins/spec で md→HTML 変換予定）。CSS injection 攻撃 / XSS のテストカバー含む 29 tests pass（specTemplate 20 + renderSpecHtml 9）、renderer-pdf 全 106 tests pass、specTemplate / renderSpecHtml 共に 100% カバレッジ

## 進行中

- Chrome Web Store v0.1.0 審査結果待ち（通常 1〜7 日、初回は 2〜3 週かかる場合あり）
- v0.1.1 release zip は `release/md-business-v0.1.1.zip` で生成済、v0.1.0 通過後に Web Store へ提出予定（PdM 操作）
- v0.2.0 minor の設計合意（A/D/E は PdM OK 受領済。サンプル md と schema-spec / renderer-pdf spec レイアウトまで実装）
- v0.2.0 残実装: chrome-extension に `plugins/spec.ts` 追加（schema レジストリ登録 + viewer ライブプレビュー連携 + md→HTML 変換）/ ローカル画像リゾルバ + DOMPurify による inline SVG 受け入れ / Mermaid 動的レンダリング / 章ファイル参照解決

## 次タスク

### v0.1.1 patch（審査結果待ち中に仕込み、通過直後に提出）

1. popup に「テンプレートから始める」ボタン追加（`templates/invoice/standard-ja.md` 等を `dist/templates/` に同梱、クリックで untitled として viewer を開く）
2. viewer に「ファイル名で保存」UI（untitled 状態でも保存可能に）
3. 書き方ガイドモーダルに frontmatter 早見表を追加
4. バージョン bump 自動化スクリプト（`pnpm release:patch / release:minor / release:major` で `package.json` + `manifest.json` 同時更新 → rebuild → zip）
5. `post-build.mjs` に `templates/` コピーを追加

### v0.2.0 minor（Phase 2 = 基本設計書スキーマ）

1. `packages/schema-spec/` 新設（基本設計書スキーマ・章立て / ER / シーケンス / 画面遷移 / 用語集 等）
2. viewer: ローカル相対パス画像 (`file:///`) リゾルバ + blob URL 差し替え
3. viewer: HTTPS 外部画像 + manifest の `host_permissions` 拡張 + CSP 調整
4. viewer: インライン `<svg>...</svg>` 受け入れ（DOMPurify サニタイズ）
5. viewer: ` ```mermaid ` コードブロックを動的 import レンダリング（mermaid.js ~200KB を遅延ロード、初期バンドルへの影響ゼロ）
6. `templates/spec/` 配下に基本設計書サンプル + draw.io SVG エクスポート例 + Mermaid サンプル
7. PDF 化時は Mermaid 描画完了を待ってから印刷

## Chrome 拡張の拡張性方針（SemVer 運用）

Chrome 拡張は単発リリースで終わらず、md-business シリーズ全体の受け皿として継続アップデートする。バージョンは SemVer に従い、0.x のうちは MINOR で破壊変更余地を残し、schema API 安定後に v1.0 を打つ。

- スキーマレジストリ型: 拡張内で `schema-invoice` `schema-spec` `schema-test-spec` 等を切替可能
- ビューワー / レンダラもスキーマごとにプラグインとして差し替え可能
- 新スキーマ追加時は MINOR bump で Chrome Web Store に再 submit、patch bump は同スキーマ内の改善

| 拡張バージョン | リリース時期 | 対応スキーマ / 主機能 |
|---|---|---|
| v0.1.0 | 2026-06-16（審査中） | `invoice`（請求書）MVP |
| v0.1.x | 審査通過直後〜 | invoice patch（テンプレ始動 UX、ファイル名 UI、書き方ガイド拡充 等） |
| v0.2.0 | Phase 2 完了時 | + `schema-spec`（基本設計書）+ 画像 / SVG / Mermaid 対応 |
| v0.3.0 以降 | Phase 3 以降 | + `test-spec` / `quotation` / `meeting-minutes` / `contract` / `resume` 等 |
| v1.0.0 | schema API 安定 + 主要スキーマ揃った時点 | 安定版宣言 |

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
