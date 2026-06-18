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

```bash
# PdM 端末で 1 回だけ実行
npm i -g @google/clasp        # workspace ローカルに含めない（minimumReleaseAge 隔離回避）
clasp login                    # ブラウザで Google ログイン
```

リポジトリディレクトリで:

```bash
cd apps/google-workspace-addon
pnpm build                     # dist/ 生成（Code.js / appsscript.json / Sidebar.html）
clasp create --type standalone --title "md-business" --rootDir dist
# → .clasp.json が dist/ 配下に生成（script ID を保持）
clasp push                     # dist/ の中身が Apps Script プロジェクトへ送信される
clasp open                     # Apps Script Editor をブラウザで開く
```

`.clasp.json` は `.gitignore` 済（script ID 漏洩を防止）。

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
| `clasp push` が `400 invalid_grant` | `clasp login` の OAuth トークン期限切れ | `clasp logout && clasp login` 再ログイン |
| サイドバー HTML が反映されない | esbuild の `copyStaticAssets` が走っていない | `pnpm build` の出力を `dist/Sidebar.html` で確認 |
| Sheets メニューに「md-business」が出ない | OAuth consent でテストユーザー未登録 | Phase B-4 にユーザー追加 |
| 「アドオンをテスト」でデプロイ ID 入力後にエラー | Apps Script ↔ GCP プロジェクト未紐付 | Phase A-4 を再実施 |
| スコープ追加申請の動画要件が不明 | 検証ガイドの更新あり | Google の最新ガイドを再確認: https://support.google.com/cloud/answer/9110914 |

---

## 関連

- [`apps/google-workspace-addon/README.md`](../apps/google-workspace-addon/README.md) — 開発者向けセットアップ
- [`.claude/decisions.md`](../.claude/decisions.md) — Phase 2 双方向同期 + Sheets-as-truth 決定
- [`.claude/roadmap.md`](../.claude/roadmap.md) — 全体タイムライン
