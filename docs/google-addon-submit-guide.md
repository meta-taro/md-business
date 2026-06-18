# Google Workspace アドオン申請手順書

`apps/google-workspace-addon` を Google Workspace Marketplace に公開するための手順書。

> **対象**: PdM（メタタロ）が手作業で進めるステップを時系列で記す。コード雛形は AI が生成済み（[`apps/google-workspace-addon/`](../apps/google-workspace-addon/)）。
>
> **正本**: [`.claude/decisions.md`](../.claude/decisions.md) 2026-06-18 行
> Workspace アドオン submit = `schema-test-spec` (v0.7.0) 完成と同時。本ガイドは **準備工程**を先行して進めるためのもの。

## 全体タイムライン（目安）

| Phase | 内容 | 担当 | 所要 | 本日（2026-06-18） |
|---|---|---|---|---|
| **A** | GCP プロジェクト作成 + Apps Script プロジェクト作成 + clasp 連携 | PdM | 1〜2 時間 | 着手可 |
| **B** | OAuth consent screen 設定（アプリ名 / ロゴ / scope 宣言 / プライバシーポリシー URL） | PdM | 1〜2 時間 | 素材揃ったら着手 |
| **C** | アドオン本体の動作確認（自分の Google アカウントでサイドバー表示まで） | PdM + AI | 半日 | 本日達成可 |
| **D** | Marketplace listing 準備（スクショ / 説明文 / 動画 / 用途タグ） | AI 草案 → PdM 入力 | 1 日 | 草案は AI 提示可 |
| **E** | OAuth 検証申請（Sensitive scope なら Google 審査 2〜6 週） | PdM | 数週間 | schema-test-spec 完成後 |
| **F** | Marketplace 公開申請 | PdM | 即日〜1 週 | E 完了後 |

---

## Phase A — GCP & Apps Script 立ち上げ

### A-1. GCP プロジェクト作成（PdM 手作業 / baseline 15 で AI 自走禁止）

1. https://console.cloud.google.com/ にログイン（PdM = `tanaka.masatomo@dokokade.co.jp`）
2. 上部「プロジェクトを選択」→「**新しいプロジェクト**」
3. プロジェクト名: `md-business-addon`
4. 組織: Dokokade Inc.（必要に応じて）
5. 「作成」

### A-2. 必要な API 有効化

GCP コンソールで以下 4 つの API を有効化（「API とサービス」→「ライブラリ」で検索 → 有効化）:

- **Google Workspace Add-ons API**
- **Google Workspace Marketplace SDK**
- **Apps Script API**
- **Google Drive API**（Workspace Marketplace 配信で必要）

### A-3. Apps Script プロジェクト作成 + clasp 連携

> **clasp v3.x 系（2026 年現在の最新）** はコマンド体系が v2 系から変わっています。`clasp create` / `clasp open` が `clasp create-script` / `clasp open-script` に renamed されているため、ネット記事の古い手順をコピペすると `Unknown command` で失敗します。本書は v3 系準拠。

```bash
# PdM 端末で 1 回だけ実行
npm i -g @google/clasp        # workspace ローカルに含めない（minimumReleaseAge 隔離回避）
clasp login                    # ブラウザで Google ログイン
```

**clasp create-script を実行する前に**、ブラウザで以下を開いて「Google Apps Script API」を **オン** にしてください。これは GCP プロジェクトの API 有効化とは別の **ユーザーアカウント単位の許可** で、必須:

> **https://script.google.com/home/usersettings**

オンにしたらリポジトリディレクトリで:

```bash
cd apps/google-workspace-addon
pnpm build                              # dist/ 生成（Code.js / appsscript.json / Sidebar.html）
clasp create-script --type standalone --title "md-business" --rootDir dist
# → .clasp.json が dist/ 配下に生成（script ID を保持）
clasp push                              # dist/ の中身が Apps Script プロジェクトへ送信される
clasp open-script                       # Apps Script Editor をブラウザで開く
```

`.clasp.json` は `.gitignore` 済（script ID 漏洩を防止）。

#### clasp v3.x コマンド対応表（v2 → v3 移行用）

| v2.x（旧・ネット記事の大半） | v3.x（現行） |
|---|---|
| `clasp create` | `clasp create-script` |
| `clasp open` | `clasp open-script` |
| `clasp open --web` | `clasp open-web-app` |
| `clasp open --addon` | `clasp open-container` |
| `clasp open --creds` | `clasp open-credentials-setup` |

`clasp push` / `clasp pull` / `clasp login` / `clasp logout` は変更なし。

#### clasp v3 の `.claspignore` セマンティクス（v2 と非互換）

clasp v3 系では `.claspignore` の挙動が変わっており、**v2 系で機能した「親 `.claspignore` + dist ホワイトリスト」方式は動きません**。

| | v2.x | v3.x |
|---|---|---|
| `.claspignore` の探索場所 | `.clasp.json` と同じディレクトリ（プロジェクトルート） | 同左 |
| パターンが評価される基点 | プロジェクトルート（`.clasp.json` の場所） | **`contentDir`**（= `.clasp.json` の `rootDir` で指定したディレクトリ。本リポでは `dist/`） |
| 結果 | `**/**` + `!dist/Code.js` のように「dist プレフィックス付きで dist 内の特定ファイルを un-ignore」が機能 | **dist プレフィックスはマッチしない**（パターンが評価される対象は既に dist 内相対パス `Code.js` であるため）。`**/**` を書くと **全ファイルが ignore** され `clasp push` が `Script is already up to date.` を返し続ける |

**本リポの `.claspignore` は v3 用に最小化済み**（`node_modules/**` `.git/**` `.DS_Store` `*.map` のみ ignore）。dist/ にはそれらが存在しないため、実質的な ignore は無く 3 ファイルが全て Tracked 扱いになります。`.claspignore` を編集する際は **dist 内相対パスを基準に書く**（dist プレフィックス禁止）。

### A-4. Apps Script プロジェクトを GCP プロジェクトに紐付け

1. Apps Script Editor 左の「プロジェクトの設定（歯車）」
2. 「Google Cloud Platform（GCP）プロジェクト」セクション
3. 「**プロジェクトを変更**」→ A-1 で作成した `md-business-addon` のプロジェクト番号を貼り付け
4. 「プロジェクトを設定」

---

## Phase B — OAuth consent screen 設定

GCP コンソール → 「API とサービス」→「**OAuth 同意画面**」

### B-1. ユーザー タイプ

- **外部**（Workspace Marketplace 公開なら必須）
- 「作成」

### B-2. アプリ情報

| 項目 | 値 |
|---|---|
| アプリ名 | `md-business` |
| ユーザー サポートメール | `tanaka.masatomo@dokokade.co.jp` |
| アプリのロゴ | `docs/assets/addon-logo.png`（120×120 PNG、要作成） |
| アプリのホームページ | `https://github.com/meta-taro/md-business` |
| プライバシーポリシー URL | `https://github.com/meta-taro/md-business/blob/main/PRIVACY.md` |
| 利用規約 URL | `https://github.com/meta-taro/md-business/blob/main/LICENSE` |
| 承認済みドメイン | `github.com`, `dokokade.co.jp` |
| デベロッパー連絡先 | `tanaka.masatomo@dokokade.co.jp` |

### B-3. スコープ宣言

`appsscript.json` の `oauthScopes` と一致させる:

- `https://www.googleapis.com/auth/spreadsheets.currentonly`
- `https://www.googleapis.com/auth/documents.currentonly`
- `https://www.googleapis.com/auth/presentations.currentonly`
- `https://www.googleapis.com/auth/script.container.ui`

すべて `.currentonly` で **現在開いているドキュメントのみ** に限定 → センシティブ判定が最小。

> 将来 GitHub commit 双方向同期を実装する際は `https://www.googleapis.com/auth/script.external_request` 追加 → センシティブ判定で Google 審査（Phase E）が必要になる。

### B-4. テストユーザー追加

公開前（OAuth status: Testing）は 100 名まで指定したユーザーのみ動作:

- `tanaka.masatomo@dokokade.co.jp`
- 検収依頼予定のメンバー Gmail

---

## Phase C — 自分のアカウントでの動作確認

1. `clasp push` 済の Apps Script プロジェクトを開く
2. 「**デプロイ → 新しいデプロイ**」→ 種類「Workspace アドオン」
3. デプロイ ID をコピー
4. Sheets を新規作成 → 「**拡張機能 → アドオン → アドオンをテスト**」
5. デプロイ ID を貼り付け → インストール
6. サイドバーの「サイドバーを開く」が動作することを確認
7. md table をテキストエリアに貼って「インポート」→ シートに反映されることを確認

トラブル時は `clasp logs` で Apps Script のログを確認。

---

## Phase D — Marketplace listing 準備（AI 草案 → PdM 入力）

GCP コンソール → 「API とサービス」→「**Google Workspace Marketplace SDK**」→「アプリ構成」

| 項目 | 内容 | AI 補佐 |
|---|---|---|
| アプリ名 | `md-business` | |
| アプリ アイコン | 32×32 / 96×96 / 128×128 PNG | デザイン要 |
| 説明文（短） | 80 文字以内 | AI 草案可 |
| 説明文（詳細） | 4000 文字以内 | AI 草案可（Chrome Web Store 説明文を流用ベース） |
| カテゴリ | 「ビジネスツール」「生産性向上」 | |
| スクリーンショット | 1280×800 推奨、最大 6 枚 | AI 撮影スクリプト可 |
| YouTube デモ動画 | 推奨（必須ではない） | PdM 撮影 |
| 利用規約 / プライバシー URL | Phase B と同一 | |
| サポート URL | `https://github.com/meta-taro/md-business/issues` | |
| 配信地域 | 日本 + 全世界 | |
| 価格 | 無料 | |

---

## Phase E — OAuth 検証申請（センシティブ scope の場合）

第一実装の `.currentonly` スコープ群は **「非センシティブ」判定**となるため、検証申請をスキップできる可能性がある。Google から「センシティブ scope を要求している」と通知が来たら以下を実施:

1. OAuth consent screen → 「アプリを公開」→ 「**確認のために送信**」
2. 用途説明文（500〜2000 文字、英語推奨）
3. デモ動画 URL（YouTube unlisted で OK）
4. 審査期間: 通常 2〜6 週、追加質問があれば長引く

---

## Phase F — Marketplace 公開申請

1. Marketplace SDK → 「公開ステータス」→ 「**公開**」
2. レビュー期間: 通常 1〜7 営業日
3. 承認後、Workspace Marketplace 上で検索可能になる

---

## AI が補佐できる範囲 / PdM のみが実行する範囲

### AI が実行可能（自動化可）

- アドオンのコード雛形・ロジック・テスト追加
- `appsscript.json` マニフェスト編集
- Marketplace listing の **草案テキスト**（説明文 / 用途文 / カテゴリ案）作成
- スクリーンショット撮影スクリプト作成（[`.tmp/resize-screenshots.ps1`](../.tmp) と同様の Pillarbox 方式）
- このガイドの更新

### PdM 手作業（baseline 15 — credential / 認証 / アカウント操作は AI 自走禁止）

- GCP プロジェクト作成 / API 有効化
- OAuth consent screen 入力
- `clasp login` / `clasp create` の Google アカウントログイン
- Marketplace listing の Console 入力（草案を AI が用意するが、貼り付けは PdM）
- アプリのアイコン / ロゴデザイン発注
- YouTube デモ動画撮影・公開
- 検証申請 / 公開申請の submit ボタン
- PrivacyPolicy.md / Terms.md の最終確認・公開

---

## トラブルシューティング

| 症状 | 原因 | 対処 |
|---|---|---|
| `clasp create-script` で `User has not enabled the Apps Script API` | ユーザー単位の Apps Script API 設定が OFF | https://script.google.com/home/usersettings でトグル ON。GCP の API 有効化とは別物 |
| `Unknown command "clasp create"` / `"clasp open"` | clasp v3.x の破壊的変更 | `clasp create-script` / `clasp open-script` に置き換え（A-3 の対応表参照） |
| `clasp push` で `Project settings not found.` | `.clasp.json` が無い（`clasp create-script` が成功していない） | A-3 をやり直し。`apps/google-workspace-addon/.clasp.json` が生成されたか確認 |
| **`clasp status` が `Tracked files: (空) / Untracked files: 全ファイル`** で `clasp push` も `Script is already up to date.` を返す | **clasp v3 で `.claspignore` のパターンが `contentDir`（= `dist/`）基点で評価される**ため、`!dist/Code.js` のような **dist プレフィックス付きホワイトリスト**は機能しない（v2 系の挙動と異なる） | `.claspignore` を **dist 内相対パス想定**に書き直す（本リポは修正済。`node_modules/**` `.git/**` `.DS_Store` `*.map` のみ ignore）。詳細は本表の下「clasp v3 の `.claspignore` セマンティクス」参照 |
| `clasp push` が `400 invalid_grant` | `clasp login` の OAuth トークン期限切れ | `clasp logout && clasp login` 再ログイン |
| Apps Script Editor を開いた時にブラウザが別の Google アカウント（個人 Gmail 等）でログイン中 | clasp は CLI 側のアカウント（業務）でプロジェクトを作るが、ブラウザのデフォルトプロファイルが個人アカウント | URL 末尾に `?authuser=tanaka.masatomo@dokokade.co.jp` を付ける / Chrome 専用プロファイル分離。**「アクセス権限をリクエスト」ボタンは絶対押さない**（個人アカウントから業務スクリプトへの権限申請メールが走る） |
| サイドバー HTML が反映されない | esbuild の `copyStaticAssets` が走っていない | `pnpm build` の出力を `dist/Sidebar.html` で確認 |
| Sheets メニューに「md-business」が出ない | OAuth consent でテストユーザー未登録 | Phase B-4 にユーザー追加 |
| 「アドオンをテスト」でデプロイ ID 入力後にエラー | Apps Script ↔ GCP プロジェクト未紐付 | Phase A-4 を再実施 |
| スコープ追加申請の動画要件が不明 | 検証ガイドの更新あり | Google の最新ガイドを再確認: https://support.google.com/cloud/answer/9110914 |

---

## 関連

- [`apps/google-workspace-addon/README.md`](../apps/google-workspace-addon/README.md) — 開発者向けセットアップ
- [`.claude/decisions.md`](../.claude/decisions.md) — Phase 2 双方向同期 + Sheets-as-truth 決定
- [`.claude/roadmap.md`](../.claude/roadmap.md) — 全体タイムライン
