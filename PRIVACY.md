# プライバシーポリシー — md-business

**最終更新日: 2026-06-18**

## 対象プロダクト

本プライバシーポリシーは、md-business シリーズの以下のソフトウェアを対象とします。

- **md-business Chrome 拡張機能**（`apps/chrome-extension`）— Chrome Web Store 配布
- **md-business Google Workspace アドオン**（`apps/google-workspace-addon`）— Google Workspace Marketplace 配布

両者とも **オープンソース（MIT ライセンス）** で、ソースコードは GitHub で監査可能です: <https://github.com/meta-taro/md-business>

## 共通要約

**md-business シリーズはいかなるユーザーデータも収集・送信・第三者共有しません。** ネットワーク通信は行わず、すべての処理はユーザーのブラウザ / Google Workspace 環境内で完結します。

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

md-business Google Workspace アドオンは、Google Docs / Sheets / Slides のサイドバーから Markdown と Google ドキュメントの双方向変換を行う、オープンソースのアドオンです。

**いかなるユーザーデータも外部サーバへ送信しません。** すべての処理は Google Apps Script ランタイム上で完結し、ユーザーが現在開いているドキュメントの読み書きのみを行います。

## 本アドオンが行うこと

- ユーザーがサイドバーに貼り付けた Markdown テキストを解析し、現在開いている Google Sheets に書き込みます。
- ユーザーの操作（「エクスポート」ボタン）に応じて、現在開いている Google Sheets の値を Markdown テーブル形式に変換し、サイドバーに表示します。
- Apps Script が提供する標準 OAuth 同意フローを通じて、ユーザーに権限を要求します。

## 本アドオンが行わないこと

- 外部サーバへのネットワーク通信は行いません（v0.1.0 時点）。
- ユーザーのデータを Google 以外の第三者と共有しません。
- アナリティクス、トラッキング、テレメトリの送信は行いません。
- ユーザーの **他のドキュメント**（現在開いていないファイル）の内容を読み取ったり書き込んだりすることはありません（`.currentonly` スコープにより技術的に不可能）。
- Cookie、広告 ID、フィンガープリント等の識別子の利用は行いません。

## 収集するデータ

**ありません。** 本アドオンはユーザーの Google アカウント情報、メールアドレス、プロフィール情報を取得・保存しません。

## 権限（OAuth スコープ）の利用目的

| スコープ | 利用目的 | 範囲 |
|---|---|---|
| `https://www.googleapis.com/auth/spreadsheets.currentonly` | 現在開いている Sheets の読み書き（インポート / エクスポート機能） | 現在開いているシートのみ |
| `https://www.googleapis.com/auth/documents.currentonly` | 現在開いている Docs の読み書き（将来の章立て変換機能） | 現在開いているドキュメントのみ |
| `https://www.googleapis.com/auth/presentations.currentonly` | 現在開いている Slides の読み書き（将来のスライド変換機能） | 現在開いているプレゼンのみ |
| `https://www.googleapis.com/auth/script.container.ui` | サイドバー UI の表示 | UI 表示のみ |

すべて Google の **非センシティブスコープ** に分類されます。`.currentonly` の制約により、ユーザーが現在開いていないファイルへのアクセスは Google 側で技術的に拒否されます。

## 将来の機能追加について

v0.2.0 以降で **GitHub への自動 commit 連携** を実装する場合、追加で以下のスコープが必要になります。これらが必要になった時点でユーザーに明示的に同意を求め、本プライバシーポリシーを更新します。

- `https://www.googleapis.com/auth/script.external_request` — GitHub API への HTTPS リクエスト送信
- ユーザーが提供する GitHub Personal Access Token を Apps Script の `PropertiesService.getUserProperties()` に保存（Google アカウント内で暗号化保管され、md-business 開発元はアクセスできません）

これらの追加機能が **有効になるのはユーザーが明示的に設定した場合のみ** です。v0.1.0 では一切送信を行いません。

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

- **2026-06-18** — Google Workspace アドオン向けの宣言を追記。Chrome 拡張部分は変更なし。
- **2026-06-16** — Chrome 拡張機能のプライバシーポリシー初版公開。
