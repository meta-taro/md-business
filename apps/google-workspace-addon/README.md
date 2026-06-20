# @md-business/google-workspace-addon

Google Workspace アドオン雛形（Docs / Sheets / Slides サイドバーから Markdown を扱う）。

> **公開ステータス**: 開発初期段階。Marketplace 申請は `schema-test-spec` (v0.7.0) 完成と同時に submit 予定（[`.claude/decisions.md`](../../.claude/decisions.md) 2026-06-18 行）。

## 役割分担（Chrome 拡張 / Workspace アドオン）

| | Chrome 拡張 (`apps/chrome-extension`) | Google Workspace アドオン (本パッケージ) |
|---|---|---|
| 主軸 | **手元 .md → A4 PDF** 出力 | **Docs / Sheets / Slides ⇔ md 双方向 UI 編集** |
| PDF | Paged.js で生成 | Google ネイティブ（ファイル → PDF ダウンロード）任せ |
| 編集 | サイドエディタ + プレビュー | Sheets / Docs / Slides の UI そのもの + サイドバー |
| 同期 | ローカル .md にのみ書き戻し | Sheets-as-truth: onEdit → Apps Script → GitHub API で md commit |

## ローカル開発フロー

```bash
pnpm install                        # ルートで（pnpm workspace）
pnpm --filter @md-business/google-workspace-addon test:run
pnpm --filter @md-business/google-workspace-addon build   # → dist/{Code.js, appsscript.json, Sidebar.html}
```

### Apps Script に push

事前に `clasp` を **グローバルインストール** する（プロジェクト依存に含めると minimumReleaseAge 隔離の影響を受けるため、`pnpm` 経由ではなく `npm i -g @google/clasp` を PdM が手作業で実行）。

```bash
npm i -g @google/clasp     # PdM 作業（1 回のみ）
clasp login                # PdM の Google アカウントでログイン
# ↓ ブラウザで Apps Script API を ON にする（ユーザー設定）:
#   https://script.google.com/home/usersettings
clasp create-script --type standalone --title "md-business" --rootDir dist
# clasp.json (.clasp.json) が dist/ 配下に生成される
pnpm --filter @md-business/google-workspace-addon build
clasp push                 # dist/ の Code.js / appsscript.json / Sidebar.html を Apps Script へ送信
clasp open-script          # Apps Script Editor をブラウザで開く
```

> **clasp v3.x 系での注意**: v2 系の `clasp create` / `clasp open` は v3 では `clasp create-script` / `clasp open-script` に renamed されています。古いネット記事のコマンドをコピペすると `Unknown command` で失敗するので、上記の v3 系コマンドを使ってください。

> **`.claspignore` の挙動も v3 で変更**: v2 系では `.claspignore` のパターンは **プロジェクトルート（`.clasp.json` の場所）相対**で評価されましたが、v3 系では **`contentDir` (= `rootDir` で指定した `dist/`) 相対**で評価されます。本リポの `.claspignore` は v3 用に最小化（`node_modules/**` `.git/**` のみ ignore）。`!dist/Code.js` のような dist プレフィックス付き whitelist は機能しません。詳細は [`docs/google-addon-submit-guide.md`](../../docs/google-addon-submit-guide.md) の「clasp v3 の `.claspignore` セマンティクス」セクション参照。

`.clasp.json` は **`.gitignore`** で git 管理外（script ID が漏れると差し替え攻撃の余地が生まれる）。

## 構成

```
src/
├── main.ts            (Apps Script trigger: onHomepage / onOpen / onInstall / showSidebar / importMarkdownTableToActiveSheet)
├── sidebar.html       (サイドバー UI — vanilla HTML + google.script.run)
└── lib/
    └── mdTable.ts     (Markdown table → string[][] 変換、Sheets row 化用)
test/
└── mdTable.test.ts
appsscript.json        (Apps Script マニフェスト: oauthScopes / addOns 定義)
esbuild.config.mjs     (IIFE バンドル + Apps Script global function 露出 footer 注入)
.claspignore           (dist/ 配下のみ push)
```

## ロードマップ（このパッケージ）

- [x] **v0.1.0 (2026-06-18)** — 雛形 + Markdown table ⇔ Sheets 双方向 import/export（PdM 手元で実機確証済）+ 申請手順書 [`docs/google-addon-submit-guide.md`](../../docs/google-addon-submit-guide.md)（実走知見を Phase A〜C のトラブルシュートに反映済）
- [ ] v0.2.0 — `schema-test-spec` 完成連動: 検証シート md ⇔ Sheets の **frontmatter スキーマ駆動 double-binding**（列スキーマ宣言 → DataValidation プルダウン / ConditionalFormat 行背景色 / DateValidation 日付ピッカー / setFrozenRows ヘッダー固定 を import で自動適用、export で逆変換して frontmatter ごと書き出し）+ `onEdit` トリガで GitHub API へ commit
- [ ] v0.3.0 — Docs 向け md ⇔ ドキュメント変換（章立て / 表 / リスト）
- [ ] v0.4.0 — Slides 向け md ⇔ プレゼン変換
- [ ] Marketplace 公開: schema-test-spec 完成と同時に submit（Phase D-F: listing 草案 → 検証申請 → 公開申請）

## 参考 / 一次資料

- [Google Workspace Add-ons overview](https://developers.google.com/workspace/add-ons/overview)
- [Apps Script Manifest reference](https://developers.google.com/apps-script/concepts/manifests)
- [Marketplace SDK](https://developers.google.com/workspace/marketplace/how-to-publish)
- [clasp](https://github.com/google/clasp)
