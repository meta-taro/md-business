# Decisions — md-business

司令塔リポ側 `projects/md-business/decisions.md` が正本。本ファイルは配布リポでの作業時参照用ミラー。

| 日付 | 決定 | 理由 |
|---|---|---|
| 2026-06-12 | リポは `meta-taro/md-business`（個人 GitHub・public・MIT） | OSS は個人アカウント運営方針 |
| 2026-06-12 | モノレポ採用（pnpm workspace + Turborepo） | スキーマ⇔ビューワーが 1:1 で密結合・同期リリース必須・fork 容易性 |
| 2026-06-12 | npm scope は `@md-business/` 推奨 | GitHub Org `mdbiz` が既存。Phase 1 公開時に `npm view` で実機確認 |
| 2026-06-12 | PDF レンダラを 2 系統並立: ブラウザ = Paged.js / サーバ = Typst | Typst の WASM ブラウザ動作は重い・Paged.js は HTML/CSS でハッカブル・Typst は inboisu で日本のインボイス対応即成立 |
| 2026-06-12 | 請求書スキーマは `mkpoli/typst-inboisu` を参照源とする | 唯一の現役 OSS で適格請求書要件を満たしている |
| 2026-06-12 | Chrome 拡張は `simov/markdown-viewer` を fork ベース | MV3 対応・GitHub raw MD レンダリング実装あり・MIT 互換 |
| 2026-06-12 | VS Code 拡張は `estruyf/vscode-front-matter` の Content Type 拡張 | 既存資産流用・frontmatter フォーム UI が完成度高い |
| 2026-06-12 | やる配布チャネル: Google Docs / Chrome / VS Code / PWA / LINE LIFF / GitHub Action | PdM 指示。非エンジニアから開発者まで網羅 |
| 2026-06-12 | やらない配布チャネル: Obsidian/Logseq / Word アドイン | PdM 指示 |
| 2026-06-12 | ライセンス MIT | OSS 王道・fork 自由を担保 |
| 2026-06-12 | UI は Lit Web Components + Tailwind CSS v4 | フレームワーク非依存・各 app に組み込みやすい |
| 2026-06-12 | コアは TypeScript | 全環境で使い回し可・型安全 |
| 2026-06-12 | 配布リポ担当者への外部委譲なし。司令塔セッションで実装 | 規模・思想・OSS 運営判断 |
| 2026-06-14 | Phase 1 を「請求書 md + Chrome 拡張のみ」に縮約（Phase 1-MVP）。`viewer-invoice` フォーム UI と `apps/pwa` は Phase 1b 以降へ移送 | PdM 指示。2026-06 中にキングダム社向け請求書フローを稼働させる目標 |
| 2026-06-14 | Chrome 拡張表示名は `md-business: Invoice (適格請求書)` | 日英併記・将来の `md-business: Test Spec` `md-business: Design Doc` 等への命名展開余地 |
| 2026-06-14 | 拡張への md 入力は拡張内インポート UI（ファイル選択） | 置き場所（git / Dropbox / ローカル）はユーザー判断と PdM 指示 |
| 2026-06-14 | 請求書 PDF は印影なしで出力。CSS で署名欄の余白のみ確保 | 適格請求書要件に印影は不要（法的義務なし）。商習慣のためのスペースのみ確保 |
| 2026-06-14 | 各社実データ（キングダム社等）は `.gitignore` で本家から排除（`/private/` `*.private.md` 等） | OSS 本家には汎用テンプレのみ。実値は別管理 |
| 2026-06-14 | Chrome Web Store 申請は public・ドコカデ社デベロッパーアカウントで実施 | 既存登録あり・OSS 本旨で公開可 |
| 2026-06-14 | Chrome 拡張は単発製品ではなく md-business シリーズ全体の受け皿。スキーマプラグイン構造で継続アップデート | PdM 指示。`v1.0.0=invoice`, `v1.1.0=+test-spec/design-doc`, `v1.2.0=+その他` |
| 2026-06-14 | Chrome 拡張の動作イメージ: ローカル md をブラウザで開いた瞬間に拡張が自動レンダリング → PDF DL | PdM 指示。`simov/markdown-viewer` の挙動を踏襲（明示的なインポートボタンに依存しない） |
| 2026-06-14 | test-spec スキーマの想定フィールド: 名前 / 日次チェック OK/NG / 備考欄（表形式） | PdM 指示。Phase 3 で実装 |
| 2026-06-14 | 将来構想（決定ではない）: ローカル単独編集 → 複数人同時編集への拡張余地を残す | PdM 指示。Phase 1b 以降で技術選定（候補: Yjs / Automerge / CRDT ベースの共同編集レイヤを PWA に組み込み） |
| 2026-06-15 | frontmatter パーサを `gray-matter` から `js-yaml` 直接呼び出しへ置換（`@md-business/core/splitFrontmatter`） | gray-matter は `lib/engines.js` に `eval(str)` を含み、未使用でもバンドルされる。Chrome MV3 の CSP `script-src 'self'` が `unsafe-eval` を拒否するため拡張が起動できなかった |
| 2026-06-15 | スキーマ検証は **Ajv standalone code generation** で各 schema パッケージが事前コンパイル（`@md-business/schema-invoice/validate`） | Ajv のランタイム `compile()` は `new Function()` を使い MV3 CSP 違反。standalone なら build 時に検証関数を ESM として吐き、ブラウザは関数を呼ぶだけ |
| 2026-06-15 | `@md-business/core` を browser-safe（`main`）/ node-only（`./runtime`）に分割 | runtime Ajv を引きずらないと chrome-extension のバンドルから `new Function()` を tree-shake で落とせない。`validateWithCompiled` のみ main から export。`validateWith`/`parseAndValidate` は `@md-business/core/runtime` に隔離 |
| 2026-06-15 | baseline 項目5 の Git hooks（pre-commit / pre-push）を Phase 0 で実装漏れしていたため Phase 1-MVP 中に補完。Husky 9 + `scripts/scan-bundle.mjs` 導入。pre-push 時にバンドルを走査し `eval` / `new Function` / `Function("...")` を検出 | Phase 0 で baseline 項目5 が書かれていたが実装されておらず、Chrome 拡張ビルドが MV3 CSP 違反を含むまま push されかけた。事前検知の不在が直接の原因。再発防止として静的検査ゲートを追加 |
| 2026-06-15 | Vite ビルドの rollupOptions.onwarn で `EVAL` warning を error 化 | 依存パッケージが将来 eval を持ち込んだ瞬間にビルドが落ちる。bundle scan より早く失敗するため二重防御 |
| 2026-06-15 | Ajv standalone 出力の生 `require()` 呼び出しを `scripts/build-validate.mjs` 内で top-level `import * as` に書き換える後処理を追加 | Ajv standalone は `esm: true` でも `ucs2length` / `ajv-formats` の helper を `require()` のまま吐く既知制約があり、ブラウザで `Uncaught ReferenceError: require is not defined` を起こした。post-process で全 `require("...")` を一意な binding に置換し、ファイル先頭に namespace import を追加することで、Vite/Rollup が正規の ESM として解決・tree-shake できる |
| 2026-06-15 | `scripts/scan-bundle.mjs` に `require("...")` 検出と「文字列/コメント内は除外」のヒューリスティック判定を追加 | 既存 scan は `eval` / `new Function` のみで、ブラウザバンドルに残る生 `require()` を見逃した。あわせて Ajv 内部の `Ue.code = 'require(...)'` メタ文字列や pagedjs のコメント `// require('util')` を誤検知しないよう、直前文字（quote）と行頭（`//` / `*`）を確認する除外を入れた |
| 2026-06-16 | PDF DL ボタンは Chrome 印刷ダイアログを自動起動するフロー（A 方針）。初回は「送信先を PDF として保存に切替」案内モーダルを出し、`mdb:pdf-guide-skip` を localStorage に保存して 2 回目以降スキップ可能 | 2026-06-14「印影なし方針」のあと、PdM から「PDF にできない人/PC もあるので DL ボタンは必須」の指示。MV3 拡張からの直接 PDF 生成は jspdf/pdf-lib 級の依存追加 + 日本語フォント埋込みになり Phase 1-MVP には重い。`window.print()` + 案内モーダルで「ユーザー手元 OS の PDF 出力」に流す方が軽量で確実 |
| 2026-06-16 | Noto Sans JP / Noto Serif JP を `@fontsource/*` 経由で拡張に同梱（`japanese` `latin` サブセット、必要 weight のみ）。`scripts/post-build.mjs` で woff2 を `dist/vendor/fonts/` にコピーし、`@font-face` を含む `dist/styles/fonts.css` を自動生成。viewer 起動時に `chrome.runtime.getURL('styles/fonts.css')` で動的読み込み | MV3 CSP は外部フォント CDN（Google Fonts 等）からの読み込みを拒否し、また審査面でも外部送信は不利。同梱式なら CSP `'self'` で成立。`@fontsource/*` は SIL OFL 1.1 で再配布可。`MdBusiness Body` / `MdBusiness Stamp` alias を追加し、各社 fork が `@font-face` を上書きするだけで篆書/楷書フォントに差し替えられる構造にした |
| 2026-06-16 | 篆書系 OSS フォントの同梱は現時点で不可と判定。Noto Serif JP Bold で代替し、`MdBusiness Stamp` alias を fork-friendly swap-point として保持 | 青柳衡山フォント T は「改変・再配布不可」のカスタムライセンスで MIT 配布リポに同梱できず、JFZSKSealScript は SIL OFL だが中国語専用で日本の仮名・JIS 1/2 漢字をカバーしない。日本語覆い率を満たす OFL 篆書フォントは現行エコシステムに存在しない。Phase 1.1 で再評価予定 |
| 2026-06-16 | ハンコ SVG ジェネレータを `packages/renderer-pdf/src/stamp.ts` に実装。`stamp.shape: auto` は法人キーワード（株式会社/有限会社/合同会社/合名会社/合資会社 + `(株)`系略号 + `㈱`系合字）を検出して角印、それ以外は丸印に自動判定。文字数で 1/2/3/4 字レイアウト分岐、ASCII テキストは横書き 1 行、CJK は縦書き/田の字。色は朱色 `#c8161d`、フォントは `MdBusiness Stamp` alias → Noto Serif JP fallback | PdM 指示「田中甫朋とか、株式会社Dokokade、株式会社キングダムを自動でハンコっぽく」。ハンコ画像を社員が用意せずとも適格請求書に体裁として印影を載せたいニーズ。SVG 1 個で完結するので追加バイナリ・CSP 影響なし。schema 側に `stamp?` フィールドを追加し、未指定ならデフォルトで非表示（2026-06-14「印影なし方針」と互換） |
| 2026-06-16 | schema-invoice v0.2: frontmatter を **日本語キー一級市民**化（英語キーも引き続き受け付け）。`taxSummary` / `totals` は `items[]` から自動算出。`taxRounding`（floor/round/ceil、既定 floor）で丸めを制御。`fileName` テンプレで PDF 保存名をカスタム可能 | 手書き運用での視認性・誤計算リスク低減。適格請求書は「税率ごとに 1 回丸める」compliance ルールがあり手計算は事故ベース。日本語キーは AI 生成時の精度も上がる。内部 TS 型は英語維持（OSS の海外フォーク・lint メッセージ可読性のため）。正規化・自動計算は schema-invoice 内の純粋関数 `normalizeInvoiceFrontmatter` / `autofillInvoice` で実装し validate の前段に挿入 |
| 2026-06-16 | 請求書 frontmatter の正本用語表（揺れ防止）を凍結。**ルートキー**: 請求書番号 / 発行日 / 支払期限 / 発行元 / 請求先 / 品目 / 振込先 / 備考 / 印影 / 丸め / ファイル名。**当事者キー**: 名前 / 敬称 / 登録番号 / 郵便番号 / 住所 / 電話 / メール。**品目キー**: 名前 / 数量 / 単位 / 単価 / 税率 / 軽減税率 / 備考。**振込先キー**: 銀行 / 支店 / 種別 / 口座番号 / 名義。**印影キー**: 有効 / 形 / 文字 / フォント。これ以外の synonym（名称・商号・氏名 等）は `dictionary.ja.ts` で正本へマッピング、衝突時は警告 | 同義語が複数許容されると Markdown 全体で揺れが生まれ、AI 生成と人間編集の二重管理になる。正本を 1 セットに絞り、別名は normalize レイヤで吸収する設計。ドキュメント・ChatGPT プロンプトで参照する基準語彙としても使う |
| 2026-06-16 | frontmatter に `theme`（青/赤/黄/橙/紫/黒/灰 プリセット or `#RRGGBB`）と `logo`（`data:image/{png,jpeg,gif,webp};base64,...` or `https://...`）を追加 | OpenAI / Canva 等の請求書 PDF はロゴ + テーマ色がデフォ。各社が CSS を触らず frontmatter 一行でブランディングできるようにする。`theme` は preset/hex 厳格マッチ、`logo` は data URI と HTTPS の regex ホワイトリストのみ受け付け（XSS / CSS injection 防御、SVG は意図的に拒否） |
| 2026-06-16 | Chrome 拡張 manifest 権限を `storage` のみに最小化（`activeTab` / `scripting` を削除） | 実コードで `chrome.tabs.*` や `chrome.scripting.executeScript` を呼んでおらず、`content_scripts` は静的注入のため `scripting` 権限不要。最小権限原則 + Chrome Web Store 審査の理由欄削減 + ユーザーインストール時の警告削減 |
| 2026-06-16 | Privacy Policy URL は GitHub の `PRIVACY.md` blob URL を直リンク（`https://github.com/meta-taro/md-business/blob/main/PRIVACY.md`） | データ収集ゼロ・完全ローカル動作なので長文ポリシーは不要、リポと同期されるシンプルな運用。GitHub Pages を立てる工数を省略。OSS 監査性も高い |
| 2026-06-16 | Chrome Web Store 申請パッケージ生成は自前 Pure Node zlib スクリプト（`apps/chrome-extension/scripts/make-release.mjs`）。`source-map` / OS junk / 既存 `.zip` `.crx` を除外、`dist/` 配下を archive root に展開 | `zip` / `7z` バイナリの可用性に依存しない再現性、外部依存追加なし（npm パッケージ抜きで CRC32 + DEFLATE 実装）、Chrome Web Store の「manifest.json が root」要件に合致する archive 構造 |
| 2026-06-16 | Chrome 拡張のバージョン展望を SemVer 起点に修正（旧: v1.0=invoice / v1.1=+test-spec、新: v0.1.0=invoice MVP / v0.2.0=+schema-spec / ... / v1.0=schema API 安定後の安定版宣言）。zip 差し替え毎に patch bump（0.1.0 → 0.1.1 → ...）、スキーマ追加は MINOR bump | Phase 1-MVP はβ段階、破壊変更余地を残したい。0.x の MINOR bump は SemVer 公認の破壊変更レーン。v1.0 マーケアピールは schema API 安定後に取っておく |
| 2026-06-16 | 印影 `extractStampChars` で姓名間の空白（半角 / 全角 / タブ、`\s+`）を除去するよう修正 | 「山田 太郎」が `['山','田',' ','太']` になり 4 文字目「郎」が落ちる、かつ空白がレイアウトに紛れる事象が `private/sample-contractor-invoice.md` で発覚。`renderStampSvg` は文字数で 1/2/3/4 字レイアウト分岐するので、空白を文字として扱うとレイアウトが破綻する |
| 2026-06-16 | 画像 / SVG / 概念図の取り扱い方針: 外部参照（`![](./figs/x.svg)` ローカル / `![](https://.../x.svg)` クラウド）+ インライン `<svg>` を基本。draw.io はネイティブレンダリングせず SVG エクスポート経由で扱う。Mermaid は ` ```mermaid ` コードブロックを動的 import で描画 | Phase 2 = 基本設計書スキーマ向け。draw.io ネイティブレンダラは XML パーサ + 図形ライブラリで実装コスト大、SVG/PNG エクスポート運用で 80% カバー可能。Mermaid は GitLab / GitHub 互換書式で AI 親和性が高く、テキスト diff が可能。mermaid.js を初期バンドルに混ぜると 200KB+ になるので、コードブロック検出時のみ動的 import |
| 2026-06-16 | popup に「テンプレートから始める」ボタンを追加（v0.1.1 patch スコープ）。`templates/invoice/*.md` を `dist/templates/` に同梱、クリックで viewer タブを untitled として開く | 第三者ユーザーが frontmatter をゼロから書くのは現実的でない（MVP のオンボーディング致命傷）。テンプレ始動 + viewer 内編集で「読み込んで編集する」フローを 1 クリックで提供する |
