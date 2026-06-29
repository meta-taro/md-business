# プライバシーポリシー — md-business

**最終更新日: 2026-06-29**

## 対象プロダクト

本プライバシーポリシーは、md-business シリーズの以下のソフトウェアを対象とします。

- **md-business Chrome 拡張機能**（`apps/chrome-extension`）— Chrome Web Store 配布
- **md-business Google Workspace アドオン**（`apps/google-workspace-addon`）— Google Workspace Marketplace 配布

両者とも **オープンソース（MIT ライセンス）** で、ソースコードは GitHub で監査可能です: <https://github.com/meta-taro/md-business>

## 共通要約

- **Chrome 拡張機能** は、ユーザーのブラウザ内ですべての処理が完結し、外部送信を一切行いません。
- **Google Workspace アドオン** は、原則すべての処理が Google Apps Script ランタイム内で完結します。例外として、ユーザーが **自身の GitHub Personal Access Token（PAT）を明示的に設定し、サイドバーの「GitHub に push」ボタンを押した時に限り**、ユーザー自身の GitHub リポジトリへ Sheets の現在の内容を `.md` として commit します。送信先はユーザーが設定した GitHub リポジトリのみで、md-business 開発元を含む第三者にデータが渡ることはありません。
- アナリティクス、トラッキング、テレメトリの送信はいずれのプロダクトでも行いません。

---

# Chrome 拡張機能

## 要約

md-business Chrome 拡張機能は、ユーザーがローカルに保存している Markdown ファイル（適格請求書スキーマの YAML frontmatter を含むもの）を Chrome 上でプレビュー表示し、ブラウザの印刷機能を通じて PDF として保存できるようにする、オープンソースの Chrome 拡張機能です。

## 本拡張機能が行うこと

- ユーザーが選択したローカルの `.md` ファイル（`file:///` 配下）を読み取ります。
- YAML frontmatter と Markdown 本文をブラウザ内で解析します。
- 解析結果を、印刷可能な請求書としてビューワータブに描画します。
- `chrome.storage.session` を使い、ポップアップで読み取った Markdown ペイロードをビューワータブに受け渡します。このデータはタブが閉じられた時点で自動的に破棄されます。

## 本拡張機能が行わないこと

- 外部サーバーへのネットワーク通信は一切行いません。
- アナリティクス、トラッキング、テレメトリの送信は行いません。
- ユーザーがアクセスする任意のウェブページの内容を読み取ったり送信したりすることはありません。
- Cookie、広告 ID、フィンガープリント等の識別子の利用は行いません。
- リモートコード（CDN スクリプト、`eval`、外部 URL からの動的 `import()`）の実行は一切行いません。すべての JavaScript / CSS / フォントは拡張機能パッケージ内に同梱されています。

---

## 収集するデータ

**ありません。** 本拡張機能はユーザーのデバイス外にデータを送出しません。したがって、第三者への販売・譲渡・共有も発生しません。

## 権限の利用目的

| 権限 | 利用目的 |
|---|---|
| `storage` | ポップアップから読み取った Markdown ペイロードを `chrome.storage.session` に一時保存し、ビューワータブへ受け渡します。タブを閉じた時点で破棄されます。 |
| `host_permissions: file:///*` | ユーザーがローカルに保存している Markdown ファイルを Chrome で開けるようにするために必要です。 |

---

# Google Workspace アドオン

## 要約

md-business Google Workspace アドオンは、Google Docs / Sheets / Slides のサイドバーから Markdown と Google ドキュメントの双方向変換、および **検証シート（test-spec）を Sheets で編集して、サイドバーの「GitHub に push」ボタンでユーザー自身の GitHub リポジトリへ commit する機能** を提供する、オープンソースのアドオンです（`git push` と同じメンタルモデル）。

処理は原則すべて Google Apps Script ランタイム上で完結します。例外として、ユーザーが **自身の GitHub Personal Access Token（PAT）を明示的に設定し、サイドバーの「GitHub に push」ボタンを押した時に限り**、Sheets の現在の内容を `.md` としてユーザー自身の GitHub リポジトリへ送信します。

## 本アドオンが行うこと

- ユーザーがサイドバーに貼り付けた Markdown テキストを解析し、現在開いている Google Sheets に書き込みます（インポート）。
- ユーザーの操作（「md 書き出し」ボタン）に応じて、現在開いている Google Sheets の値を Markdown 形式（YAML frontmatter + 表）に変換し、サイドバーに表示します（エクスポート）。
- `schema: test-spec/v1` の検証シートを Sheets に取り込んだ際、列スキーマに従い DataValidation / ConditionalFormat / DateValidation を自動適用します。
- **ユーザーがサイドバーの「GitHub に push」ボタンを押した時**、ユーザー設定の GitHub リポジトリ・ブランチ・パスへ md ファイルを commit します（GitHub REST API を `UrlFetchApp` で呼び出します）。送信先はフロントマターの `repository: owner/repo@branch:path` でユーザーが宣言します。
- Apps Script が提供する標準 OAuth 同意フローを通じて、ユーザーに権限を要求します。

## 本アドオンが行わないこと

- md-business 開発元を含む **第三者サーバへのデータ送信は一切行いません**。GitHub への送信はユーザー自身の設定したリポジトリへのみ行われます。
- ユーザーの Google アカウント情報・メールアドレス・プロフィール情報を取得・保存しません。
- アナリティクス、トラッキング、テレメトリの送信は行いません。
- Cookie、広告 ID、フィンガープリント等の識別子の利用は行いません。
- リモートコード（CDN スクリプト、`eval`、外部 URL からの動的 `import()`）の実行は一切行いません。すべてのコードは Apps Script プロジェクト内に同梱されています。

## 収集するデータ

**ありません。** 本アドオンが保存するのは、ユーザー自身が入力した GitHub 接続設定（リポジトリ名・ブランチ・パス・PAT）のみで、Google アカウント内の `PropertiesService.getUserProperties()` に保管されます。これは Google アカウント内で暗号化され、md-business 開発元からはアクセスできません。

## 権限（OAuth スコープ）の利用目的

本アドオンは以下の 5 スコープを要求します。このうち 1 件のみが Google の **センシティブ（Sensitive）スコープ** に分類され、本アドオンが Google Workspace Marketplace の OAuth 検証申請を受ける根拠となっています。

| スコープ | 区分 | 利用目的 |
|---|---|---|
| `https://www.googleapis.com/auth/spreadsheets.currentonly` | 非 Sensitive | サイドバーの「GitHub に push」ボタン押下時に、**現在開いているシートのみ** 読み取って `.md` に変換するために必要。アクティブシート以外には一切アクセスしません。 |
| `https://www.googleapis.com/auth/documents.currentonly` | 非 Sensitive | 現在開いている Docs の読み書き（章立て変換機能） |
| `https://www.googleapis.com/auth/presentations.currentonly` | 非 Sensitive | 現在開いている Slides の読み書き（スライド変換機能） |
| `https://www.googleapis.com/auth/script.container.ui` | 非 Sensitive | サイドバー UI の表示 |
| `https://www.googleapis.com/auth/script.external_request` | **Sensitive** | GitHub REST API への HTTPS リクエスト（ユーザー設定の GitHub リポジトリへの commit）。**ユーザーが「GitHub に push」ボタンを押した時のみ実際に通信が発生します**。 |

## 第三者へのデータ提供

ユーザーがサイドバーの「GitHub に push」ボタンを押すと、Sheets の現在の内容はユーザー自身が frontmatter `repository:` で指定した GitHub リポジトリへ送信されます。**GitHub への送信先・送信内容・送信タイミングはすべてユーザーが自分の設定とボタン操作で決定** します。md-business 開発元はこの通信に介在せず、内容を受け取ることも記録することもありません。

GitHub のプライバシーポリシーは GitHub Inc. が定めるものに従います: <https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement>

## GitHub Push 機能を使わない場合

GitHub PAT を設定せず、「GitHub に push」ボタンを押さない限り、本アドオンは外部ネットワークと一切通信しません。インポート / エクスポート / 検証 / PDF 出力（Chrome 拡張連携）の基本機能だけを使うこともできます。

---

# 共通

## オープンソース

md-business シリーズの全ソースコードは MIT ライセンスのもと、以下で公開されています:

<https://github.com/meta-taro/md-business>

すべての権限利用箇所とネットワーク通信の有無は、コードレベルで監査可能です。

## お問い合わせ

プライバシーに関するご質問は、以下の GitHub Issue でお問い合わせください:

<https://github.com/meta-taro/md-business/issues>

## 改訂履歴

- **2026-06-29** — Google Workspace アドオン scope ダウングレード反映: `spreadsheets`（フル）→ `spreadsheets.currentonly` に変更。実装は元々アクティブシートのみアクセスする構造であったため、最小権限原則に整合させた。Sensitive スコープを 2 件 → 1 件（`script.external_request` のみ）に削減。`script.scriptapp` の manifest 残置記述は実体と乖離していたため削除（manifest には元々含まれていない）。
- **2026-06-24** — Google Workspace アドオン v0.7.1 反映: 自動同期（onEdit installable trigger）を廃止し、サイドバーの「GitHub に push」ボタン押下時に commit する手動 push 方式へ移行。Sensitive スコープを 3 件 → 2 件（`spreadsheets` / `script.external_request`）に整理。`script.scriptapp` は manifest 残置のみ（次バージョンで削除予定）と明記。
- **2026-06-22** — Google Workspace アドオン v0.7.0 反映: GitHub 自動同期機能の追加に伴い、Sensitive スコープ 3 件（`spreadsheets` / `script.external_request` / `script.scriptapp`）を明示。「外部送信なし」記述を撤回し、ユーザー自身の GitHub リポジトリへの送信仕様を追記。
- **2026-06-18** — Google Workspace アドオン向けの宣言を追記。Chrome 拡張部分は変更なし。
- **2026-06-16** — Chrome 拡張機能のプライバシーポリシー初版公開。
