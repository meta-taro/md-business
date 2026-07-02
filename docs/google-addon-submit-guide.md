# Google Workspace アドオン申請手順書

`apps/google-workspace-addon` を Google Workspace Marketplace に公開するための手順書。

> **対象**: PdM（メタタロ）が手作業で進めるステップを時系列で記す。コード雛形は AI が生成済み（[`apps/google-workspace-addon/`](../apps/google-workspace-addon/)）。
>
> **正本**: [`.claude/decisions.md`](../.claude/decisions.md) 2026-06-18 行
> Workspace アドオン submit = `schema-test-spec` (v0.7.0) 完成と同時。本ガイドは **準備工程**を先行して進めるためのもの。

## 全体タイムライン（目安）

| Phase | 内容 | 担当 | 所要 | 本日（2026-06-18） |
|---|---|---|---|---|
| **A-1〜A-3** | GCP プロジェクト作成 + API 有効化 + Apps Script プロジェクト作成 + clasp 連携 | PdM | 1〜2 時間 | 達成済 |
| **B** | OAuth consent screen 設定（アプリ名 / ロゴ / scope 宣言 / プライバシーポリシー URL / 必要ならテストユーザー or 「内部に公開」） | PdM | 1〜2 時間 | 達成済 |
| **A-4** | Apps Script ↔ GCP プロジェクト紐付け（B-1〜B-3 完了後でないと紐付けが受理されない） | PdM | 5 分 | 達成済 |
| **C** | アドオン本体の動作確認（テストデプロイ → Sheets サイドバー → import/export 双方向動作） | PdM + AI | 半日 | **達成済（2026-06-18）** |
| **D** | Marketplace listing 準備（スクショ / 説明文 / 動画 / 用途タグ） | AI 草案 → PdM 入力 | 1 日 | 草案は AI 提示可 |
| **E** | OAuth 検証申請（Sensitive scope なら Google 審査 2〜6 週） | PdM | 数週間 | schema-test-spec 完成後 |
| **F** | Marketplace 公開申請 | PdM | 即日〜1 週 | E 完了後 |

### 実施順序の注意（2026-06-18 PdM 実走時の知見）

**正しい順序**: `A-1 → A-2 → A-3 → B-1 → B-2 → B-3 → A-4 → B-4（or 内部公開）→ C`

- **A-4 を A-3 の直後にやると詰まる**: Apps Script Editor の「プロジェクトを変更」ダイアログで GCP プロジェクト番号を入れても、OAuth consent screen が未作成の GCP プロジェクトは紐付け先として有効化されない。先に B-1〜B-3 を最小限済ませる
- **C は A-4 完了後でないとサイドバーが起動しない**: Apps Script ↔ GCP 紐付けがないと oauthScopes 解決ができず `onHomepage` が internal error になる
- **B-4 と「内部に公開」は二者択一**: Workspace ドメイン配下の GCP プロジェクトで User type を「外部」のままにすると、テストユーザー登録は **ドメインポリシーで preempt されて効かず**、個別 Gmail でログインしても OAuth 画面が「アクセス権限をリクエスト」モードになる。最速の打開策は B-1 で「内部」を選ぶこと（GCP プロジェクトが組織配下にあるなら可能。Marketplace submit 前に「外部」に戻す）

---

## Phase A — GCP & Apps Script 立ち上げ

### A-1. GCP プロジェクト作成（PdM 手作業 / baseline 15 で AI 自走禁止）

1. https://console.cloud.google.com/ にログイン（PdM = `tanaka.masatomo@dokokade.co.jp`）
2. 上部「プロジェクトを選択」→「**新しいプロジェクト**」
3. プロジェクト名: `md-business-addon`
4. 組織: Dokokade Inc.（必要に応じて）
5. 「作成」

### A-2. 必要な API 有効化

GCP コンソールで以下の API を有効化（「API とサービス」→「ライブラリ」で検索 → 有効化）。**サイドバー UI のみで動作するレベルでは 4 つで足りる**が、`.currentonly` スコープが各サービスへ実 access する以上は **Sheets / Docs / Slides の各 API も有効化しておくのが安全**（OAuth 同意画面の検証で「未有効 API への scope 要求」と警告される事例あり）:

**必須（4 つ）**:

- **Google Workspace Add-ons API**
- **Google Workspace Marketplace SDK**
- **Apps Script API**
- **Google Drive API**（Workspace Marketplace 配信で必要）

**推奨（`.currentonly` スコープが触る対象、3 つ）**:

- **Google Sheets API**
- **Google Docs API**
- **Google Slides API**

### A-3. Apps Script プロジェクト作成 + clasp 連携

> **clasp v3.x 系（2026 年現在の最新）** はコマンド体系が v2 系から変わっています。`clasp create` / `clasp open` が `clasp create-script` / `clasp open-script` に renamed されているため、ネット記事の古い手順をコピペすると `Unknown command` で失敗します。本書は v3 系準拠。

`clasp` は **`pnpm dlx` 経由**で実行（baseline §1: npm 禁止 / workspace 依存に含めると minimumReleaseAge 隔離の影響を受けるため、global install ではなく `pnpm dlx` で都度実行）:

```bash
# PdM 端末で 1 回だけ実行
pnpm dlx @google/clasp login   # ブラウザで Google ログイン
```

**clasp create-script を実行する前に**、ブラウザで以下を開いて「Google Apps Script API」を **オン** にしてください。これは GCP プロジェクトの API 有効化とは別の **ユーザーアカウント単位の許可** で、必須:

> **https://script.google.com/home/usersettings**

オンにしたらリポジトリディレクトリで:

```bash
cd apps/google-workspace-addon
pnpm build                                          # dist/ 生成（Code.js / appsscript.json / Sidebar.html）
pnpm dlx @google/clasp create-script --type standalone --title "md-business" --rootDir dist
# → .clasp.json が dist/ 配下に生成（script ID を保持）
pnpm dlx @google/clasp push                         # dist/ の中身が Apps Script プロジェクトへ送信される
pnpm dlx @google/clasp open-script                  # Apps Script Editor をブラウザで開く
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

> **実施タイミング**: Phase B-1〜B-3（OAuth consent screen 作成）の **後** に行う。先に A-4 を試みると「指定の GCP プロジェクトには OAuth consent screen が無いため紐付けできません」系のエラーで弾かれる。

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

#### B-2 補足: `addOns.common.logoUrl` は HTTPS 200 必須

`appsscript.json` の `addOns.common.logoUrl` は OAuth consent のロゴとは **別** の、Workspace アドオン Side Panel（Sheets / Docs / Slides 右側の縦アイコンバー）に表示されるアイコン URL。**404 や private リポの raw URL を指定すると Side Panel アイコン自体が非表示になり、「テストデプロイしたのに md-business が出ない」事象になる**（2026-06-18 PdM 実走で遭遇、原因特定に 1 時間）。確認手順:

1. `appsscript.json` の `addOns.common.logoUrl` をブラウザに直接貼って HTTPS 200 を返すか確認
2. 自前アイコンが未確定なら placeholder として `https://www.gstatic.com/images/branding/product/2x/apps_script_48dp.png`（Apps Script 公式ロゴ、Google CDN）を当てておく
3. Side Panel に出ているかは Sheets / Docs / Slides を開いて右側のアイコン列で確認（拡張機能メニューではなく **右側 Side Panel**）

### B-3. スコープ宣言

`appsscript.json` の `oauthScopes` と一致させる（2026-06-29 時点・[Issue #48](https://github.com/meta-taro/md-business/issues/48) で `spreadsheets` フル → `.currentonly` ダウングレード反映済）:

| スコープ | 判定 | 用途 |
|---|---|---|
| `https://www.googleapis.com/auth/spreadsheets.currentonly` | 非センシティブ | 現在開いている Sheets のみ読み書き（インポート / md 書き出し / GitHub push 時の読み取り） |
| `https://www.googleapis.com/auth/documents.currentonly` | 非センシティブ | 現在開いている Docs のみ読み書き |
| `https://www.googleapis.com/auth/presentations.currentonly` | 非センシティブ | 現在開いている Slides のみ読み書き |
| `https://www.googleapis.com/auth/script.container.ui` | 非センシティブ | サイドバー UI 表示（Workspace アドオン仕様で必須） |
| `https://www.googleapis.com/auth/script.external_request` | **センシティブ** | GitHub REST API への HTTPS リクエスト（「GitHub に push」ボタン押下時のみ通信発生） |

> **訂正（2026-06-29）**: 旧版の本書では `script.container.ui` をセンシティブと記載していたが、Google の現行分類では非センシティブ（Workspace Add-ons の標準 UI scope）。Sensitive 判定は `script.external_request` のみで、Phase E の検証申請はこの 1 件の justification + デモ動画で対応する。
>
> **訂正（2026-06-18）**: 旧版では `script.container.ui` を含むすべてのスコープを「非センシティブ」とまとめていたが、当時の分類変動に合わせて一時的にセンシティブ表記にしていた。本日の見直しで現行の Google 公式分類（非センシティブ）に揃え直した。

#### `useLocaleFromApp: true` は要注意（暗黙の `script.locale` 要求）

`appsscript.json` に `useLocaleFromApp: true` を書くと、Apps Script ランタイムが暗黙で `https://www.googleapis.com/auth/script.locale` スコープを要求し、宣言なしだと実行時に `スクリプトにはその操作を行う権限がありません。必要な権限: https://www.googleapis.com/auth/script.locale` でクラッシュする。**日本語固定で運用するなら `useLocaleFromApp` を書かない**のが最小スコープ構成。i18n を導入する段で `script.locale` を `oauthScopes` に追加する（センシティブ scope ではない）。

### B-4. テストユーザー追加（External で進める場合）

公開前（OAuth status: Testing）は 100 名まで指定したユーザーのみ動作:

- `tanaka.masatomo@dokokade.co.jp`
- 検収依頼予定のメンバー Gmail

### B-4 補足: Workspace ドメインなら「内部に公開」が最速ルート

GCP プロジェクトが Workspace 組織（例: `dokokade.co.jp`）配下にある場合、OAuth 同意画面の User type を **「内部」**（Internal）に切り替えると以下のメリットがある:

- 検証申請（Phase E）が **不要** で全 scope が即座に同ドメイン内ユーザーに対して使える
- テストユーザー登録も不要（同ドメイン内の全アカウントが対象）
- **External + Testing 状態で発生する「アクセス権限をリクエスト」誤動作を回避できる**

**手順**: GCP コンソール → OAuth 同意画面 → 上部の「**内部に公開**」ボタン（User type を Internal に切り替え）

**注意**:

- Marketplace 公開（Phase F）の直前に **必ず「外部」に戻す**。Internal のままだとドメイン外ユーザーに配信されない
- Internal で submit する選択肢もあるが、その場合 Workspace Marketplace の「ドメイン内専用アプリ」として扱われ、外部ドメインからは検索できない
- 個人 Gmail（`*@gmail.com`）は Internal では使えない。社員アカウント（`*@dokokade.co.jp`）に限定される

### B-4 補足: External 状態で個人 Gmail からアクセスすると「アクセス権限をリクエスト」が走る

Workspace ドメインポリシーが External + Testing 状態の OAuth に preempt をかけているため、テストユーザー登録が無効化される条件がある。その状態で個人 Gmail（例: `taro@gmail.com`）で OAuth 画面を開くと、「アクセス権限をリクエスト」UI（https://support.google.com/docs/answer/16722399 に redirect）が出る。**ここで「リクエストを送信」を押すと、個人 Gmail から業務 Apps Script への共有依頼メールが管理者宛に飛ぶ**（baseline §17 違反の温床）。

**対処**:

1. 受信した共有依頼メールは **「不承認」を即押下**（個人 Gmail に edit 権を渡してはならない）
2. 「内部に公開」ルート（上記）に切り替える、または個人 Gmail を使わず社員アカウントで検証する
3. Chrome に個人アカウントと社員アカウントが同時ログインしているとタブごとに context が flip して事故が起きやすい → **dokokade.co.jp 業務専用の Chrome プロファイル分離を推奨**

---

## Phase C — 自分のアカウントでの動作確認

1. `clasp push` 済の Apps Script プロジェクトを開く
2. 「**デプロイ → デプロイをテスト**」→ 種類「Workspace アドオン」（テストデプロイなのでバージョン管理デプロイは不要）
3. インストール対象の「Editor アプリ」をチェック（Sheets / Docs / Slides）
4. 「インストール」→ ダイアログを閉じる
5. Sheets / Docs / Slides を **新規作成 or 既存ファイルを開く**（拡張機能メニューではなく **右側 Side Panel** に md-business アイコンが現れる）
6. アイコンをクリック → サイドバーが開く → 「Markdown 業務文書を Docs / Sheets / Slides ⇔ md で双方向編集します」のホームページカードが表示されることを確認
7. 「サイドバーを開く」→ textarea + 「インポート」「エクスポート」ボタンが表示されることを確認
8. textarea に md table を貼って「インポート（md → シート）」→ シートに反映されることを確認
9. シートを編集して「エクスポート（シート → md）」→ textarea に Markdown が出力されることを確認

トラブル時は `pnpm dlx @google/clasp logs` で Apps Script のログを確認。

### Phase C の典型的詰まりポイント

| 症状 | 原因 | 対処 |
|---|---|---|
| 「アドオンをテスト」でデプロイ ID 入力後にエラー | Apps Script ↔ GCP プロジェクト未紐付 | A-4 を再実施 |
| デプロイは成功するが Side Panel にアイコンが出ない | `addOns.common.logoUrl` が 404 / private repo | B-2 補足「`addOns.common.logoUrl` は HTTPS 200 必須」参照 |
| 「拡張機能 → アドオン → アドオンを管理」に出ない | これは Marketplace 公開済アプリの一覧で、テストデプロイは別経路 | Side Panel（右側縦アイコン列）を見る |
| `スクリプトにはその操作を行う権限がありません: script.locale` | `useLocaleFromApp: true` の暗黙 scope 要求 | B-3「`useLocaleFromApp: true` は要注意」参照 |
| OAuth 同意画面で「アクセス権限をリクエスト」が出る | External + Workspace ドメインポリシー preempt | B-4 補足「内部に公開ルート」参照 |
| Chrome のタブ毎にアカウントが flip する | 複数アカウント同時ログイン | dokokade.co.jp 業務専用 Chrome プロファイル分離 |

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
| YouTube デモ動画 | **必須**（センシティブ scope 申請時） | PdM 撮影 — [台本](./oauth-verification-demo-video-script.md) |
| 利用規約 / プライバシー URL | Phase B と同一 | |
| サポート URL | `https://github.com/meta-taro/md-business/issues` | |
| 配信地域 | 日本 + 全世界 | |
| 価格 | 無料 | |

---

## Phase E — OAuth 検証申請（センシティブ scope の場合）

本アドオンは `script.external_request`（GitHub REST API への HTTPS 通信）を **センシティブ scope 1 件** として要求するため、検証申請は **必須**。他のドキュメント操作 scope はすべて `.currentonly` 系（非センシティブ）にダウングレード済み（Issue #48）。

1. OAuth consent screen → 「アプリを公開」→ 「**確認のために送信**」
2. 用途説明文を貼付（[`marketplace-listing.md`](./google-addon-marketplace-listing.md) §OAuth 検証申請 — スコープ用途説明 に英文 1 件を用意済み）
3. デモ動画 URL（YouTube unlisted で OK・PdM 撮影 — [撮影台本](./oauth-verification-demo-video-script.md)）
   - **判明（2026-06-30）**: Auth Platform の「データアクセス」タブで、センシティブ／制限付き scope（本アドオンでは `script.external_request` と `script.container.ui`）の編集画面に「デモ動画」フィールドが存在し、未入力だと "リクエストされたスコープに次のフィールドがありません: デモ動画" エラーで申請ブロックされる。「推奨」ではなく**実質必須**。
4. 審査期間: 通常 2〜5 週、追加質問があれば長引く

> **scope ダウングレード履歴**: 旧版（〜2026-06-28）では `spreadsheets`（フル sensitive）+ `script.external_request` の 2 件 sensitive 構成だったが、`main.ts` の実装が `getActiveSpreadsheet().getActiveSheet()` 系のみで `openById` 等を使わないことから `.currentonly` に縮小可能と判明。2026-06-29 にダウングレード（Issue #48 / PR）し、sensitive 1 件構成へ移行。

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
| `clasp push` が `400 invalid_grant` | `clasp login` の OAuth トークン期限切れ | `pnpm dlx @google/clasp logout && pnpm dlx @google/clasp login` 再ログイン |
| Apps Script Editor を開いた時にブラウザが別の Google アカウント（個人 Gmail 等）でログイン中 | clasp は CLI 側のアカウント（業務）でプロジェクトを作るが、ブラウザのデフォルトプロファイルが個人アカウント | URL 末尾に `?authuser=tanaka.masatomo@dokokade.co.jp` を付ける / Chrome 専用プロファイル分離。**「アクセス権限をリクエスト」ボタンは絶対押さない**（個人アカウントから業務スクリプトへの権限申請メールが走る） |
| サイドバー HTML が反映されない | esbuild の `copyStaticAssets` が走っていない | `pnpm build` の出力を `dist/Sidebar.html` で確認 |
| **Side Panel（右側縦アイコン列）に md-business アイコンが出ない** | `addOns.common.logoUrl` が 404 / private repo の raw URL / 画像でない URL | `appsscript.json` の `logoUrl` をブラウザで開き HTTPS 200 を確認。placeholder として `https://www.gstatic.com/images/branding/product/2x/apps_script_48dp.png` で動作確認可 |
| Sheets メニューに「md-business」が出ない | テストデプロイは「拡張機能 → アドオン → アドオンを管理」には**載らない**（あれは Marketplace 公開済アプリの一覧） | 右側 **Side Panel** にアイコンが出ているか確認。出ていない場合は上記 logoUrl 行 / A-4 紐付け行を参照 |
| 「アドオンをテスト」でデプロイ ID 入力後にエラー | Apps Script ↔ GCP プロジェクト未紐付 | Phase A-4 を再実施（B-1〜B-3 完了後に） |
| **OAuth 同意画面が「アクセス権限をリクエスト」モードになる** | Workspace ドメインポリシー（External + Testing の preempt） | Phase B-4 補足「内部に公開」ルートに切替 / または個人 Gmail を使わず社員アカウントで検証。**「リクエストを送信」は押さない**（個人 Gmail から業務アプリへの共有依頼メールが走る → 受信側で「不承認」） |
| **`スクリプトにはその操作を行う権限がありません。必要な権限: https://www.googleapis.com/auth/script.locale`** | `appsscript.json` の `useLocaleFromApp: true` が暗黙で `script.locale` scope を要求しているが宣言していない | `useLocaleFromApp` を削除する（日本語固定運用なら不要）/ または `oauthScopes` に `script.locale` 追加 |
| Chrome のタブ毎にアカウントが flip / OAuth が想定外のアカウントで進む | 個人 Gmail + 業務アカウントが Chrome に同時ログイン | 不要アカウントをログアウト / Chrome の「ユーザー追加」で dokokade.co.jp 業務専用プロファイルを作成して恒久分離 |
| スコープ追加申請の動画要件が不明 | 検証ガイドの更新あり | Google の最新ガイドを再確認: https://support.google.com/cloud/answer/9110914 |

---

## 関連

- [`apps/google-workspace-addon/README.md`](../apps/google-workspace-addon/README.md) — 開発者向けセットアップ
- [`.claude/decisions.md`](../.claude/decisions.md) — Phase 2 双方向同期 + Sheets-as-truth 決定
- [`.claude/roadmap.md`](../.claude/roadmap.md) — 全体タイムライン
