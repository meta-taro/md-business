# Project Status — md-business

最終更新: 2026-06-17（**v0.5.0 = v0.4.0 + Mermaid subset build 復活**: cytoscape を空 shim で排除 + lodash CSP 違反パターンを vite plugin で置換 → scan-bundle clean、ER / flowchart / sequence などが MV3 CSP 下で描画可能に）

## 現在のフェーズ

**Phase 1-MVP 公開済み（v0.1.0）→ v0.5.0 を Web Store update として提出予定**

2026-06-16 にドコカデ Inc. アカウントで v0.1.0 を submit、2026-06-17 に審査通過＆公開。store URL: https://chromewebstore.google.com/detail/lmdplkkfmgapnhombimeohjliinifgjh （extension ID 固定）。

v0.2.0 〜 v0.5.0 のスコープを 1 つの zip にまとめて v0.5.0 として提出する（バージョン 0.1.1 → 0.5.0 への単発 bump）:
- v0.2.0 系: DOMPurify サニタイザ + schema-spec（基本設計書）骨格 + remark→HTML 変換
- v0.3.0 系: 免税事業者モード（`taxExemptIssuer` 後方互換拡張、renderer-pdf が経過措置案内を自動出力、tax-exempt-ja テンプレ）
- v0.4.0 系: popup の適格 / 免税分岐 UX + 書き方ガイドモーダルに免税モード解説 + frontmatter 早見表更新
- v0.5.0 系: Mermaid 動的 import 描画復活（cytoscape 空 shim + lodash CSP 違反 vite plugin 置換、ER / flowchart / sequence など対応）+ 基本設計書 spec.css に章タイトル / Mermaid 図の改頁制御を追加（6.1 注文確定フロー regression 対応、15p → 14p に圧縮、Mermaid 1 ページ収納成功）

Mermaid の MV3 CSP 突破は **2026-06-17 朝の撤回（id 61）を即日撤回（id 67）**: cytoscape を `src/shims/cytoscape-empty.ts`（call で throw する空 shim）に alias で差し替え、`vite.config.ts` の `shimLodashCspViolations()` plugin で lodash 由来の `Function('return this')()` を `globalThis` に、`x.require('util').types` を `undefined` に置換。`mermaid.initialize({ securityLevel: 'strict' })`、class marker による short-circuit で請求書フローは zero-cost、scan-bundle clean。

Issue #15（高橋たくと氏 → 株式会社キングダム宛 6 月分請求書）が v0.3.0 のドライバ、すでに schema/renderer/template/private 全レイヤで成立済み。

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
- 2026-06-17 v0.5.0 Mermaid 復活実装。`mermaid@11.15.0` 動的 import + `<pre><code class="language-mermaid">` short-circuit、`vite.config.ts` で cytoscape 系 3 パッケージを `src/shims/cytoscape-empty.ts` に alias、`shimLodashCspViolations()` vite plugin で lodash CSP 違反パターン（`Function('return this')()` / `x.require('util').types`）を browser-safe 実装に置換（lodash-es + `@mermaid-js/parser` dist の両方）。`apps/chrome-extension/src/shared/renderMermaid.ts` 87 行 + 4 unit tests、`packages/renderer-pdf/src/styles/spec.css` に `.mdb-mermaid` / `.mdb-mermaid--error` 追加、`viewer/index.ts` の `renderPreviewFromSource` と `runPrintFlow` を await async 化。`scripts/scan-bundle.mjs` clean、chrome-extension 36 tests pass、`v0.4.0 → v0.5.0` minor bump（`scripts/bump-version.mjs`）
- 2026-06-17 `packages/schema-spec/` 骨格実装。JSON Schema draft 2020-12（required: schemaVersion/documentNumber/title/version/issueDate/status/authors、SemVer pattern、ISO date format、`.md` chapters pattern、additionalProperties: false）+ TypeScript 型 + 日本語キー dictionary（root + party scope、status/toc/theme 値翻訳）+ Ajv standalone build。44 tests pass（schema 14 + normalize 30）、coverage 100% lines / 94.87% branches
- 2026-06-17 `packages/schema-spec` 完成度向上: autofill（schemaVersion / version=0.1.0 / status=draft / toc=auto デフォルト、toc=manual で chapters 空時の警告、toc=auto と chapters 同時指定の mixed signal 警告）+ translateError（Ajv エラー / normalize / autofill 警告を日本語化、SemVer / `.md` / YYYY-MM-DD ヒント、enum 許可値を明記）+ parseSpec（splitFrontmatter → normalize → autofill → validateWithCompiled の MV3 CSP セーフな End-to-End）+ fileName（`{文書番号} / {タイトル} / {版} / {ステータス} / {発行日YMD} / {YMD}` token、Windows 禁止文字サニタイズ、デフォルト `基本設計書_{文書番号}_v{版}`）。96 tests pass（schema 14 + normalize 30 + autofill 10 + translateError 21 + fileName 14 + parseSpec 7）、coverage 99.52% lines / 82.57% branches
- 2026-06-17 `packages/renderer-pdf` に基本設計書レイアウト追加。`renderSpecBody(spec, options)` で表紙ページ（タイトル / ステータスバッジ / 文書番号 / 版 / 発行日 / 作成者 / レビュアー / 関連文書、テーマアクセントカラー、左端 6mm カラーバー）+ `renderSpecHtml(spec, options)` フル HTML 文書ラッパ + `src/styles/spec.css`（A4 縦、表紙 page-break-after、h1 章ごと page-break-before、h2 左ボーダー、テーブル / コードブロック / Mermaid コンテナ / 引用 / 画像スタイル）。`bodyHtml` は viewer 側責務（chrome-extension の plugins/spec で md→HTML 変換予定）。CSS injection 攻撃 / XSS のテストカバー含む 29 tests pass（specTemplate 20 + renderSpecHtml 9）、renderer-pdf 全 106 tests pass、specTemplate / renderSpecHtml 共に 100% カバレッジ
- 2026-06-17 `@md-business/core` に `renderMarkdownToHtml(src, options)` 追加。`remark-parse → remark-rehype → rehype-stringify` の unified パイプライン（純 JS、MV3 CSP セーフ）で Markdown → HTML 変換。`allowDangerousHtml: false` で生 HTML を破棄（XSS 防御）、`hasFrontmatter` オプションで frontmatter 分離有無を制御。19 tests、100% カバレッジ
- 2026-06-17 `apps/chrome-extension` に `shared/sanitizeHtml.ts` 追加（DOMPurify 3 ベース）。Markdown→HTML 後の bodyHtml を viewer で injection 防御。`USE_PROFILES: { html, svg, svgFilters }` で SVG カメルケース属性（viewBox/preserveAspectRatio）を保持、`ALLOW_UNKNOWN_PROTOCOLS: true` + `uponSanitizeAttribute` フックで URI スキーム allowlist（https / blob / mailto / `data:image/{png|jpg|gif|webp|svg+xml};base64,` + 相対 `# / ? / /`、`http:` / `data:text/html` / `javascript:` / `vbscript:` / 相対パスは拒否）。`FORBID_TAGS` で form/input/iframe/object/embed をブロック、`FORBID_ATTR` で srcdoc 除去。spec plugin の render/previewRender からサニタイザを呼ぶよう更新。テスト環境を node → jsdom に切替（happy-dom は HTML 先頭 `<h1>` を head に正規化し本文先頭の章タイトルが消える既知挙動のため不採用）。24 件のサニタイザテスト追加（XSS / 属性ホワイトリスト / SVG / Mermaid コード塊保持 / 通常 markdown 通過）、chrome-extension 全 77 tests pass、sanitizeHtml.ts 92.42% カバレッジ
- 2026-06-17 `apps/chrome-extension` に `plugins/spec.ts` 追加。`SchemaPlugin` 契約を `render(frontmatter, markdownBody?)` / `previewRender(frontmatter, markdownBody?)` の 2 引数に拡張（invoice plugin は body 無視、spec plugin は使用）。`loadMarkdown` / `previewMarkdown` を `parseMarkdown().body` も渡すよう更新。registry に spec plugin を登録（detect: 文書番号 / 章ファイル / レビュアー / documentNumber / chapters / reviewers）。post-build.mjs を `copySchemaCss`（invoice.css + spec.css 両方）に統合 + `templates/spec/standard-ja.md` を STARTER_TEMPLATES に追加（popup から「テンプレートから始める」で開けるように）。chrome-extension 全 53 tests pass（spec plugin 14 + registry 14 + invoice loadMarkdown 8 + previewMarkdown 8 + bumpVersion 9）、spec.ts 96.2% カバレッジ。repo 全体で typecheck + test:run + build green
- 2026-06-17 **v0.3.0 免税事業者モード** schema-invoice 改修。`invoice.schema.json` の `issuer.required` を `["name"]` のみに縮約、`issuer.taxExemptIssuer: boolean` プロパティ追加（後方互換）。`InvoiceIssuer.registrationNumber` を optional 化 + `taxExemptIssuer?: boolean` 追加。`dictionary.ja.ts` party scope に `免税事業者` / `taxExemptIssuer` / `免税` / `非適格` / `インボイス未登録` → `taxExemptIssuer` 正本マッピング追加。`autofill.ts` に `checkIssuerQualification` 追加（both-set / neither-set を警告通知、path: `issuer.taxExemptIssuer` / `issuer.registrationNumber`）。`translateError.ts` で `/issuer/taxExemptIssuer` 日本語ラベル追加 + `registrationNumber` ヒントに「免税事業者なら taxExemptIssuer: true で代替可」を追記。schema-invoice 全 81 tests pass（既存テストの後方互換性維持 + 免税モード 7 tests 追加）
- 2026-06-17 **v0.3.0 renderer-pdf 免税事業者表示分岐**。`renderInvoiceBody` で `invoice.issuer.taxExemptIssuer === true` を検知し、タイトル `<h1>請求書</h1>` 直下に `<p class="mdb-invoice__non-qualified-notice">※ 適格請求書ではありません（インボイス制度経過措置の対象）</p>`（赤字 #b91c1c、9pt、600 weight）と、本文末尾の備考 section 直前に `<section class="mdb-invoice__transition-notice">本請求書は適格請求書発行事業者以外が発行したものです。インボイス制度の経過措置（2023年10月〜2029年9月）の範囲で仕入税額控除を行ってください。</section>`（グレーボックス・左端アクセントボーダー）を自動出力。`.mdb-invoice` ルート要素に `data-tax-exempt="true"` 属性も付与してテーマ別 CSS 拡張可能。`styles/invoice.css` に対応スタイル追加。renderer-pdf 全 112 tests pass（免税事業者モード 6 tests 追加、`taxExemptInvoice()` fixture factory）
- 2026-06-17 **v0.3.0 chrome-extension invoicePlugin / popup 調整**。`plugins/invoice.ts` の label を `請求書（適格請求書）` → `請求書（適格 / 免税対応）` に更新。`apps/chrome-extension/scripts/post-build.mjs` の `STARTER_TEMPLATES` に `tax-exempt-ja.md` 第 4 エントリを追加（label: `日本語フィールド名・免税事業者向け`、description: 免税事業者 + 経過措置案内自動出力）。`dist/templates/manifest.json` に 5 件のテンプレが揃った
- 2026-06-17 **v0.3.0 テンプレ `templates/invoice/tax-exempt-ja.md`** 追加。屋号なし個人事業主想定（山田 太郎 → 株式会社サンプル受領先宛）、90,000 × 10% = 9,000 / total 99,000 サンプル。`免税事業者: true` を明示、taxSummary / totals は YAML コメントで参考値（feedback-invoice-manual-calc 方針）を残して autofill に委譲、登録番号フィールドは存在しない。日本語キー throughout、テーマ青、丸印スタンプ無効
- 2026-06-17 **v0.3.0 private/2026-06-contractor-invoice.md** を高橋たくと氏の本番テンプレに整備。旧 `登録番号: ""` + TODO コメント → `免税事業者: true` に切替、備考から redundant な経過措置記述を削除（renderer が自動出力する）。3 リポジトリ運用（store-girlsbar / store-concafe-maid / store-cabaret）× 30,000 円/月 = 90,000 + 税 9,000 = 99,000 円。ファイル名: `御請求書_{請求先}{敬称}_高橋たくと_{YMD}`
- 2026-06-17 v0.3.0 完了時点で **repo 全体 408 tests pass / lint 10 pkg green / typecheck 10 pkg green / 5 pkg build green**。dist/templates/manifest.json に 5 テンプレ揃った（standard-ja / standard / inbound-eligible / **tax-exempt-ja** / spec/standard-ja）
- 2026-06-17 **v0.4.0 検収フィードバック対応（6 件まとめて 1 コミット）**: (1) renderer-pdf 免税テンプレからタイトル直下の朱書き「※ 適格請求書ではありません」と「〜へ」受領者サブタイトルを撤回（商習慣配慮、本文末尾の経過措置案内は維持）。(2) `@md-business/core` の `renderMarkdownToHtml` に `remark-gfm@^4.0.0` 追加、`templates/spec/standard-ja.md` の「3.1 機能一覧」pipe table が `<table>` として描画されるよう修正。(3) `packages/renderer-pdf/src/styles/spec.css` の表紙を A4 1 ページ収まりに圧縮: `@page :first` margin: 0、`.mdb-spec__cover` を `min/max-height: 297mm` + `overflow: hidden`、title 28→26pt + 余白 18→12mm、meta 14→10mm、status 14→10mm、cover-inner padding 40/24/32/22 → 24/22/14/22mm に圧縮。(4) `@media screen` の `box-shadow` と外側 8mm margin を撤去（プレビューと印刷の見た目を一致）。(5) **印刷キャンセル時のプレビュー消失バグ修正**（apps/chrome-extension/src/viewer/index.ts `runPrintFlow`）: プレビュー iframe を上書きする旧実装を撤回し、専用の隠し iframe（`#mdb-print-frame`）を毎回作って印刷後に `remove()` する方式へ。キャンセル時もメイン UI は無変化。core 44 tests + renderer-pdf 112 tests + chrome-extension 77 tests + 全体 472 tests pass、scan-bundle clean、v0.4.0 zip 再生成済み

## 進行中

- v0.4.0 zip Web Store update 提出（PdM 手動 push 待ち → 提出）
- v0.5.0 / Mermaid 代替手段の検討（静的 SVG 埋め込み / 軽量代替ライブラリ / mermaid 完全 vendor 化）

## 次タスク

### v0.4.0 提出パッケージ生成（直近）

1. ✅ `manifest.json` / `package.json` を 0.1.1 → 0.4.0 へ bump
2. ✅ roadmap / decisions / project-status を Mermaid 延期 + v0.4.0 統合に更新
3. ✅ `pnpm --filter @md-business/chrome-extension release` で `release/md-business-v0.4.0.zip` 再生成（Mermaid 抜き）
4. ✅ scan-bundle clean（6 bundled JS, 0 violations）
5. ✅ PdM 検収フィードバック（6 件: 朱書き撤回 / 経過措置案内維持 / GFM pipe table / 表紙 1 ページ / シャドウ撤去 / 印刷キャンセルバグ）を反映 → zip 再々生成
6. ⏳ PdM が push → PdM が Web Store update 提出

### v0.5.0 minor（請求書実務細部 + Mermaid 代替）

1. frontmatter `振込手数料: ご負担 | 元負担` を schema-invoice に追加（autofill が備考末尾に文章生成、上書き可能）
2. frontmatter `締日基準: 月末 | 20日 | カスタム` を追加（renderer-pdf が支払期限の文章補足を生成）
3. frontmatter `丸め: 切り捨て | 四捨五入 | 切り上げ` の UI 説明・選択肢のドキュメント整備（既に内部は `taxRounding` 実装済）
4. viewer に「適格事業者登録番号の調べ方」リンクモーダル（国税庁の公表サイト案内）
5. `templates/invoice/` に振込手数料込み・締日カスタムのサンプル
6. **Mermaid 代替手段** — spec テンプレの ` ```mermaid ` ブロックは現状生ソース表示。代替案を比較検討（A: 静的 SVG 埋め込み運用へ寄せる / B: 軽量代替ライブラリ調査 / C: mermaid + 必要 chunk のみ vendor 化して CSP 適合させる）
7. **manifest.json / package.json の version を 0.5.0 に bump → release zip → PdM が Web Store update 提出**

## Chrome 拡張の拡張性方針（SemVer 運用）

Chrome 拡張は単発リリースで終わらず、md-business シリーズ全体の受け皿として継続アップデートする。バージョンは SemVer に従い、0.x のうちは MINOR で破壊変更余地を残し、schema API 安定後に v1.0 を打つ。

- スキーマレジストリ型: 拡張内で `schema-invoice` `schema-spec` `schema-test-spec` 等を切替可能
- ビューワー / レンダラもスキーマごとにプラグインとして差し替え可能
- 新スキーマ追加時は MINOR bump で Chrome Web Store に再 submit、patch bump は同スキーマ内の改善

| 拡張バージョン | リリース時期 | 対応スキーマ / 主機能 |
|---|---|---|
| v0.1.0 | 2026-06-16（公開済み） | `invoice`（請求書）MVP |
| v0.1.x | 2026-06-16〜 | invoice patch（テンプレ始動 UX、ファイル名 UI、書き方ガイド拡充 等） |
| v0.4.0 | 2026-06-17 AM（zip 提出待ち） | + `schema-spec`（基本設計書）+ 画像 / SVG / DOMPurify サニタイザ + 免税事業者モード + popup 適格/免税分岐 UX（Mermaid は CSP 違反で延期） |
| v0.5.0 | 2026-06-17 PM（zip 提出待ち） | + Mermaid subset build 復活 + 免税事業者 1 ページ収まり再発 fix + Playwright E2E（renderer-pdf）|
| v0.5.x+ | 2026-06-18〜 | + 請求書実務細部（振込手数料 / 締日 / 端数処理）|
| v0.6.0+ | Phase 3 以降 | + `test-spec` / `quotation` / `meeting-minutes` / `contract` / `resume` 等 |
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
