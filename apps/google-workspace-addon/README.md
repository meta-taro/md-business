# @md-business/google-workspace-addon

Google Workspace アドオン。検証シートの Markdown をスプレッドシートの表として開いて記入し、サイドバーのボタンで GitHub へ書き戻す。

> **公開ステータス**: 0.1.0（未公開）。Google Workspace Marketplace の審査と OAuth 検証を進めている段階で、まだ配っていない。変更履歴は [`CHANGELOG.md`](./CHANGELOG.md)。申請手順は [`docs/google-addon-submit-guide.md`](../../docs/google-addon-submit-guide.md) を参照。

## 役割分担（Chrome 拡張 / Workspace アドオン）

| | Chrome 拡張 (`apps/chrome-extension`) | Google Workspace アドオン (本パッケージ) |
|---|---|---|
| 主軸 | **手元 .md → A4 PDF** 出力 | **Docs / Sheets / Slides ⇔ md 双方向 UI 編集** |
| PDF | Paged.js で生成 | Google ネイティブ（ファイル → PDF ダウンロード）任せ |
| 編集 | サイドエディタ + プレビュー | Sheets / Docs / Slides の UI そのもの + サイドバー |
| 同期 | ローカル .md にのみ書き戻し | Sheets-as-truth: サイドバーの「GitHub に push」ボタン → GitHub Contents API で md commit |

## ローカル開発フロー

```bash
pnpm install                        # ルートで（pnpm workspace）
pnpm --filter @md-business/google-workspace-addon test:run
pnpm --filter @md-business/google-workspace-addon build   # → dist/{Code.js, appsscript.json, Sidebar.html}
```

### Apps Script に push

`clasp` は **`pnpm dlx` 経由**で実行する（本リポは npm を使わない方針で、workspace 依存に含めると minimumReleaseAge 隔離の影響を受けるため、global install ではなく `pnpm dlx` で都度実行する）。

```bash
pnpm dlx @google/clasp login              # 公開元の Google アカウントでログイン
# ↓ ブラウザで Apps Script API を ON にする（ユーザー設定）:
#   https://script.google.com/home/usersettings
pnpm dlx @google/clasp create-script --type standalone --title "md-business" --rootDir dist
# clasp.json (.clasp.json) が dist/ 配下に生成される
pnpm --filter @md-business/google-workspace-addon build
pnpm dlx @google/clasp push               # dist/ の Code.js / appsscript.json / Sidebar.html を Apps Script へ送信
pnpm dlx @google/clasp open-script        # Apps Script Editor をブラウザで開く
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

- [x] **0.1.0** — Markdown table ⇔ Sheets 双方向 import/export + 申請手順書 [`docs/google-addon-submit-guide.md`](../../docs/google-addon-submit-guide.md)。あわせて `schema-test-spec` 連動: 検証シート md ⇔ Sheets の **frontmatter スキーマ駆動 double-binding**（列スキーマ宣言 → DataValidation プルダウン / ConditionalFormat 行背景色 / DateValidation 日付ピッカー / setFrozenRows ヘッダー固定 を import で自動適用、export で逆変換して frontmatter ごと書き出し）+ サイドバーの「GitHub に push」ボタンで GitHub Contents API へ commit（`git push` と同じメンタルモデル）
- [ ] Docs 向け md ⇔ ドキュメント変換（章立て / 表 / リスト）
- [ ] Slides 向け md ⇔ プレゼン変換
- [ ] Marketplace 公開（審査中）

## 参考 / 一次資料

- [Google Workspace Add-ons overview](https://developers.google.com/workspace/add-ons/overview)
- [Apps Script Manifest reference](https://developers.google.com/apps-script/concepts/manifests)
- [Marketplace SDK](https://developers.google.com/workspace/marketplace/how-to-publish)
- [clasp](https://github.com/google/clasp)
