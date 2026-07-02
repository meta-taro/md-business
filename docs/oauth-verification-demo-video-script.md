# OAuth 検証デモ動画 撮影台本（md-business Google Workspace Add-on）

> このドキュメントは Google OAuth 検証（Phase E）で要求される YouTube デモ動画の撮影台本。
> センシティブ／制限付き scope のジャスティフィケーションに添付する。
> 動画は YouTube 限定公開（unlisted）で OK。公開不要。

## 要件サマリ（Google 公式）

- 動画冒頭で **OAuth クライアント ID または プロジェクト名** を画面に表示（テキストオーバーレイ可）
- 各 sensitive / restricted scope について、**実際にその権限が使われる操作シーン**を映す
- ナレーション or 字幕で「何のスコープか / なぜ必要か / どのデータにアクセスするか」を説明（英語推奨）
- OAuth 同意画面（consent screen）が表示され、ユーザーが「許可」を押す瞬間を映す
- 動画長さ：3〜5 分目安
- アップロード先：YouTube（限定公開で可）
- 字幕：英語推奨。ナレーション無しでもオンスクリーン字幕で代替可

## 撮影前チェックリスト

- [ ] Google Sheets で空のスプレッドシートを 1 枚用意
- [ ] サンプル test-spec md ファイル（`docs/test-spec/sample.md` 等）を用意
- [ ] GitHub にテスト用リポを 1 つ用意（または既存の md-business リポでも可）
- [ ] GitHub Personal Access Token（PAT、`contents:write` 権限）を発行
- [ ] 録画ツール：Windows クリップチャンプ / OBS / Loom 等
- [ ] 画面解像度：1280×720 以上推奨
- [ ] 音声：ナレーション無し可。字幕オーバーレイで対応可

## 撮影台本（タイムライン）

### Scene 1: タイトル画面（0:00–0:15）

オーバーレイテキスト：

```
md-business — Google Workspace Add-on
OAuth Verification Demo Video

Project: md-business
OAuth Client ID: <Auth Platform の「クライアント」タブからコピー>
Recorded: 2026-06-30
```

### Scene 2: アプリ概要（0:15–0:30）

字幕：

> This add-on lets users edit business documents — test specifications,
> design documents, invoices — in Google Sheets, and push them back to
> their own GitHub repository as Markdown.
>
> All data processing happens locally in the Google Apps Script runtime.
> No data is sent to the add-on developer.

画面：md-business の GitHub repo（README.md）をブラウザで一瞬映す。

### Scene 3: インストール + OAuth 同意（0:30–1:00）

操作：

1. Google Sheets を開く（空のスプレッドシート）
2. メニュー：拡張機能 → md-business → サイドバーを開く
3. OAuth 同意画面が表示される
4. **要求される scope 一覧を画面でズームして見せる**：
   - See, edit, create, and delete only the specific Google Drive files you use with this app（`spreadsheets.currentonly`）
   - View and manage documents that this application has been installed in（`documents.currentonly`）
   - View and manage presentations that this application has been installed in（`presentations.currentonly`）
   - Display and run third-party web content in prompts and sidebars inside Google applications（`script.container.ui`）
   - Connect to an external service（`script.external_request`）
5. 「許可」をクリック
6. サイドバーが起動する

字幕：

> Five scopes are requested:
> three currentonly scopes (active document only),
> script.container.ui (sidebar UI),
> and script.external_request (GitHub API).

### Scene 4: spreadsheets.currentonly の実演（1:00–1:30）

字幕：

> Demonstrating: spreadsheets.currentonly.
> This scope reads and writes only the currently open sheet.
> The add-on never accesses any other spreadsheet in the user's Drive.

操作：

1. サイドバーの「md からインポート」エリアに、サンプル test-spec の Markdown を貼り付け
2. 「インポート」ボタンをクリック
3. **現在開いているシートに**ヘッダー行 + データ行が書き込まれる様子を映す
4. ドライブを開き、他のスプレッドシートが一切変更されていないことを示す（任意）

### Scene 5: script.container.ui の実演（1:30–2:00）

字幕：

> Demonstrating: script.container.ui.
> This scope is required to display the add-on sidebar inside Google Sheets.
> All sidebar HTML, CSS, and JavaScript is bundled in the add-on itself —
> no remote code is loaded at runtime.

操作：

1. サイドバーを再度開閉して、サイドバー UI そのものを映す
2. ブラウザの DevTools → Network タブを開く
3. サイドバーのボタンをクリックしても、外部 CDN への通信が一切発生しないことを示す
4. （任意）clasp で push した Apps Script プロジェクトの HTML ファイル一覧を見せ、すべてバンドル済であることを示す

### Scene 6: script.external_request の実演（2:00–3:00）

字幕：

> Demonstrating: script.external_request.
> This scope is used only to push the user's sheet back to their own
> GitHub repository as Markdown, via the GitHub REST API.
>
> The user provides their own GitHub Personal Access Token and target
> repository. Nothing is sent to any other endpoint, including the
> add-on developer.

操作：

1. サイドバーの「GitHub 設定」エリアを開く
2. GitHub PAT を貼り付け（**実際の PAT は黒塗りでもよいが、入力欄に何か入る様子を映す**）
3. リポジトリ：`meta-taro/md-business-demo`（または用意したテストリポ）
4. ブランチ：`main`
5. パス：`docs/test-spec/demo.md`
6. 「保存」をクリック
7. 「**GitHub に push**」ボタンをクリック
8. 「commit 完了」のトースト表示を映す
9. ブラウザで GitHub のリポを開き、リフレッシュ
10. 新しい commit が追加され、`docs/test-spec/demo.md` が作成されていることを示す
11. **DevTools の Network タブで `api.github.com` 以外への通信が発生していないことを示す**（最重要）

### Scene 7: プライバシー要約（3:00–3:30）

字幕：

> Summary:
> - All processing is local to the Google Apps Script runtime
> - GitHub push only happens when the user explicitly clicks the button
> - User's GitHub PAT is stored only in PropertiesService.getUserProperties()
> - No analytics, no telemetry, no tracking
> - Open source (MIT): github.com/meta-taro/md-business
> - Privacy policy: meta-taro.github.io/md-business/privacy/

画面：

- privacy policy ページ（`https://meta-taro.github.io/md-business/privacy/`）をブラウザで開いて軽くスクロール
- GitHub repo を開いて MIT LICENSE を見せる

### Scene 8: 終了（3:30）

オーバーレイテキスト：

```
md-business
Open source · MIT License
https://github.com/meta-taro/md-business
```

---

## YouTube アップロード設定

| 項目 | 値 |
|---|---|
| タイトル | `md-business Google Workspace Add-on — OAuth Verification Demo` |
| 説明文 | 下記参照 |
| 公開範囲 | **限定公開（Unlisted）** |
| カテゴリ | 科学と技術 |
| 言語 | 日本語 + 英語字幕 |
| サムネイル | 任意（アプリアイコン使用可） |

### YouTube 説明文（コピペ用）

```
This is an OAuth verification demo video for the md-business Google Workspace Add-on.

The add-on enables users to edit business documents (test specifications, design documents, invoices, etc.) in Google Sheets, and push them back to their own GitHub repository as Markdown with full version history.

Scopes demonstrated:
- spreadsheets.currentonly — Read/write only the active sheet
- documents.currentonly — Read/write only the active Google Doc
- presentations.currentonly — Read/write only the active Google Slides
- script.container.ui — Display sidebar UI (no remote code)
- script.external_request — Push to user's own GitHub repository via GitHub REST API

All data processing is local to the Google Apps Script runtime. No data is sent to the add-on developer or to any third-party service except the user's explicitly configured GitHub repository, only when the user clicks the "Push to GitHub" button.

Open source (MIT License): https://github.com/meta-taro/md-business
Privacy policy: https://meta-taro.github.io/md-business/privacy/
```

---

## Auth Platform への登録手順

1. Google Auth Platform → 「データアクセス」タブ → 「問題を解決します」ボタン
2. 各 ⚠ スコープ（`script.external_request` / `script.container.ui`）の編集画面を開く
3. 「**デモ動画**」フィールドに YouTube URL を貼り付け
4. ジャスティフィケーション（英文）は既に入力済 → そのまま
5. 保存
6. 「データアクセス」タブのエラーバナーが消えることを確認
7. 「ブランディング」「対象」「クライアント」も含めて全タブに ⚠ が無いことを確認
8. 検証センター → 「確認のために送信」

---

## 補足

- 動画は申請が通った後も削除しないこと（Google が後日参照する場合あり）
- 動画 URL は Auth Platform の各スコープ単位で同じ URL を貼って OK（複数 scope のデモをひとつの動画に集約する運用が一般的）
- 撮影中に PAT などの secret が一瞬でも画面に映った場合、その PAT は即座に revoke して新しい PAT を発行すること（同じ動画を再撮影 or 該当シーンだけ撮り直し）
- ホームページ URL 問題（`meta-taro.github.io` 所有権検証）は別軸で対応中（[`docs/google-addon-submit-guide.md`](./google-addon-submit-guide.md) 参照）。デモ動画とは独立の問題なので、デモ動画が用意できた時点で「データアクセス」タブの ⚠ は消える。
