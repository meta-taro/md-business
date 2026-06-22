# Google Workspace Marketplace Listing 草案

> Google Workspace Marketplace SDK の「アプリ構成」画面に PdM が **コピー&ペースト** するためのテキスト草案。AI が事前に推敲済み。
>
> 関連: [`docs/google-addon-submit-guide.md`](./google-addon-submit-guide.md) Phase D

---

## アプリ名（App name, 30 字以内）

```
md-business
```

代替案（カテゴリ検索でヒットしやすい命名）:

```
md-business — Markdown 業務文書アドオン
```

> 30 字制限ぎりぎり（日本語 20 字 + 半角 9 字 = 29 字）。本家ブランド + 検索キーワード両立。

---

## 短い説明（Short description, 80 字以内）

```
Markdown で書いた業務文書（請求書 / 基本設計書 / 検証シート）を Google Docs / Sheets / Slides と双方向同期する OSS アドオン。
```

> 79 文字。OSS であること・対象書類・対象アプリの 3 点を網羅。

---

## 詳細な説明（Detailed description, 4000 字以内）

```markdown
md-business は **Markdown ファースト × 特化ビューワー × 多チャネル配信** の OSS シリーズです。本 Google Workspace アドオンは、Markdown と Google Docs / Sheets / Slides を **双方向で同期** し、さらに **検証シート（テスト項目書）を Sheets で編集して GitHub に自動 commit** する開発フロー連携を提供します。

## こんな悩みに

- **Markdown で書いた業務文書を、Google ドキュメントで共同編集したい**
- **Sheets で編集した検証シートを、Git 管理可能な Markdown として保存したい**
- **請求書・基本設計書・検証シートをエンジニアと非エンジニアが同じデータで触りたい**
- **PDF への変換は Google ネイティブ機能で十分。md ⇔ ドキュメント の往復と Git 連携が欲しい**

## できること（v0.7.0）

- **Markdown ⇄ Google Sheets 双方向変換**: サイドバーに `schema: test-spec/v1` の YAML frontmatter を含む md を貼り付けて「インポート」すると、列スキーマ（型 / enum / 日付 / チェックボックス / URL など）に従って DataValidation と ConditionalFormat が自動適用された Sheets に変換されます。Sheets を編集して「md 書き出し」を押すと、frontmatter + 表形式の Markdown へラウンドトリップで戻ります。
- **検証シート（test-spec）の列スキーマ強制**: enum 値の制約・日付バリデーション・必須列の検証を Sheets 上で即時フィードバック。サイドバーから「検証」ボタンで未知の列名・enum 違反・型不一致をまとめてレポートします。
- **GitHub 自動同期（オプトイン）**: ユーザー自身が GitHub Personal Access Token を設定し、対象リポジトリ / ブランチ / パスを指定すると、Sheets の編集をトリガーに `.md` ファイルを自動 commit します。コミットメッセージは frontmatter の `documentNumber` から自動生成し、不要な編集はデバウンスでまとめて 1 commit にまとめます。
- **テンプレートから始める**: 適格請求書 / 基本設計書 / 検証シート のサンプルテンプレを内蔵。Markdown 初心者でも貼り付けるだけで雛形が動きます。
- **Docs / Sheets / Slides** いずれの画面からも、右側パネルからアドオンを呼び出せます。

## このアドオンの位置づけ

md-business シリーズは **「Markdown が真実、各ビューワーは表現」** という設計思想です。本アドオンは Google Sheets を「データ入力面」、Markdown を「正本」として扱い、両者を双方向で同期します。

PDF 出力は Google Docs / Sheets / Slides の **既存「ファイル → ダウンロード → PDF」機能** に任せ、本アドオンでは扱いません。手元の `.md` から印刷品質の PDF を作りたい場合は、姉妹プロダクトの Chrome 拡張 [md-business Markdown 業務文書ビューワー](https://chromewebstore.google.com/) をご利用ください。

## オープンソース

- **ソースコード**: https://github.com/meta-taro/md-business
- **ライセンス**: MIT
- **Issue / バグ報告**: https://github.com/meta-taro/md-business/issues
- **fork して各社カスタムを作る** ことを推奨。本家へのマージは強制しません。

## 権限とプライバシー

本アドオンは以下の 6 スコープを要求します。GitHub 自動同期機能のため、3 件は Google の **センシティブ（Sensitive）スコープ** に該当します。

センシティブスコープ:

- `spreadsheets` — 検証シートの自動同期で、onEdit トリガーから対象シートを読み取って Markdown に変換するために必要です。`.currentonly` ではトリガー文脈から他シートを読めないため、広いスコープを要求します。
- `script.external_request` — GitHub REST API への HTTPS 通信（ユーザー設定の GitHub リポジトリへの自動 commit）。**ユーザーが自動同期を有効化した場合のみ実際に通信が発生します。**
- `script.scriptapp` — onEdit installable trigger の登録 / 削除（自動同期の有効化・無効化）。

非センシティブスコープ:

- `documents.currentonly` — 現在開いている Docs のみ読み書き
- `presentations.currentonly` — 現在開いている Slides のみ読み書き
- `script.container.ui` — サイドバー UI の表示

**送信先は GitHub のみ** で、送信先リポジトリ・ブランチ・パスはユーザーが設定で決定します。md-business 開発元を含む第三者にデータが渡ることはありません。自動同期を使わない場合、本アドオンは外部ネットワークと一切通信しません。

詳細は [PRIVACY.md](https://github.com/meta-taro/md-business/blob/main/PRIVACY.md) をご確認ください。

## 想定ユーザー

- **エンジニア**: 業務文書を Git で管理したい・PR レビューで仕様変更を追跡したい
- **PdM / PjM**: 検証シートを Sheets で関係者と共有しつつ、md として Git にも残したい
- **個人事業主・小規模事業者**: 適格請求書を Markdown で版管理しつつ、必要に応じて Google Sheets で計算したい

## 動作要件

- Google Workspace アカウント（個人 Gmail / Workspace 法人 / 教育のいずれも対応）
- Google Docs / Sheets / Slides いずれかが利用可能であること
- GitHub 自動同期を使う場合は GitHub アカウント + Personal Access Token（contents: write 権限）
- 特別なソフトウェアのインストールは不要（ブラウザのみ）

## サポート

- バグ報告 / 機能要望: GitHub Issues
- セキュリティ脆弱性: GitHub リポジトリ内 SECURITY.md を参照

## 今後のロードマップ

1. **v0.7.1** — onEdit 自動同期の細部改善・エッジケース対応
2. **v0.8.0** — DB 設計書スキーマ（schema-db-spec / schema-nosql-db-spec）対応
3. **v0.9.0** — GitHub Action 連携（PR で md → Sheets diff コメント）
4. **v1.0.0** — Slides スキーマ

最新版は GitHub リポジトリ（リリースタブ）を確認してください。
```

> 約 3,400 文字（コードフェンス・見出し含む）。Marketplace は Markdown 不可なので、Console 貼付前に **見出しを「【】」へ置換**するか、改行のみで整形してください（PdM 作業）。

---

## カテゴリ

- 第一カテゴリ: **生産性向上**
- 第二カテゴリ: **ビジネスツール**

> Marketplace は 2 カテゴリ選択可能。検索性最大化のためこの組み合わせ。

---

## 用途タグ（Tags）

Marketplace SDK の「用途」「業種」の自由入力に貼り付け:

```
Markdown, GitHub, ドキュメント変換, 請求書, 適格請求書, インボイス, 基本設計書, 検証シート, テスト項目書, テスト管理, OSS, Git, 業務文書, 双方向同期, 自動コミット
```

---

## アイコン仕様

| サイズ | 用途 | 形式 |
|---|---|---|
| 32×32 | Marketplace リスト | PNG / 透過なし |
| 96×96 | Marketplace 詳細 | PNG / 透過なし |
| 128×128 | OAuth consent screen | PNG / 透過なし |

> 既存ブランドカラーは `#1a73e8`（Google ブランド準拠の青）。デザイン発注 or SVG → PNG 変換は PdM 作業。本リポの `apps/chrome-extension/public/icons/` を流用可能（要リサイズ）。

---

## スクリーンショット仕様

| サイズ | 内容 | 撮影タイミング |
|---|---|---|
| 1280×800 PNG (最大 6 枚) | サイドバーから md ⇔ Sheets 変換 / 検証シート例 / Docs 章立て変換 / Slides 区切り変換 / 設定画面 / Git 連携の流れ | Phase C 動作確認後 |

> Chrome Web Store 用スクショと同様の **白余白で 1280×800 にパディング** する方式が使えます（[`reference_chrome_web_store_screenshot_spec.md`](../../Users/syste/.claude/projects/C--claude-md-business/memory/reference_chrome_web_store_screenshot_spec.md) 参照）。`.tmp/resize-screenshots.ps1` 同等のスクリプトを使い回し可能。

---

## YouTube デモ動画

**任意・推奨**。30 秒〜90 秒で:

1. アドオンをインストール
2. サイドバーを開いて Markdown テーブルを貼る
3. Sheets に行が書き込まれる
4. 一部セルを編集して「エクスポート」
5. Markdown が更新されてサイドバーに戻る

> Phase C 完了後に PdM が撮影。Marketplace 申請の必須項目ではないが、審査速度が上がる傾向あり（Google 側の人手レビュアーが用途を即座に理解できるため）。

---

## サポート / プライバシー / 利用規約 URL

| 項目 | URL |
|---|---|
| サポート | https://github.com/meta-taro/md-business/issues |
| プライバシーポリシー | https://github.com/meta-taro/md-business/blob/main/PRIVACY.md |
| 利用規約 | https://github.com/meta-taro/md-business/blob/main/LICENSE |
| 開発元ホームページ | https://github.com/meta-taro/md-business |
| デベロッパー連絡先 | tanaka.masatomo@dokokade.co.jp |

---

## 配信地域

```
全世界（特に: 日本 / 米国 / 中国 / ドイツ / インド）
```

> Marketplace は地域選択可。OSS なので全世界配信、説明文は当面日本語のみ。英語版は v1.0.0 以降に検討。

---

## 価格

```
無料
```

OSS 配布。Marketplace の有料化機能は使わない。

---

## よくある質問（FAQ 草案 / Marketplace は FAQ 欄なし、README に転載用）

### Q. Microsoft Word や Excel のファイルは扱えますか？

A. 扱いません。本シリーズは Markdown を真実とする設計で、Office 系は対象外です。

### Q. PDF 出力は？

A. Google Docs / Sheets / Slides の **「ファイル → ダウンロード → PDF」** をご利用ください。md → 印刷品質 PDF を直接欲しい場合は姉妹プロダクトの Chrome 拡張をご利用ください。

### Q. Markdown 以外の業務文書フォーマット（reStructuredText / AsciiDoc）は？

A. v1.0.0 時点では対応予定なし。fork して各社で拡張してください。

### Q. ユーザーデータはどこに保存されますか？

A. 本アドオンは外部サーバへのデータ送信を行いません（v0.1.0）。すべて開いているドキュメント / シート / プレゼン内で完結します。

### Q. オフラインでも動きますか？

A. Google Workspace の仕様上、ドキュメント自体のオフライン対応に依存します。アドオン側は Apps Script ランタイムを利用するため、ネットワーク接続が必要です。

---

## OAuth 検証申請 — スコープ用途説明（Phase E）

OAuth consent screen → 「アプリを公開」→ 「確認のために送信」で、Sensitive スコープごとに **「Why are you requesting this scope?」** の入力が求められます。以下を英語で貼り付け（Google レビュアー向け）。

### `auth/spreadsheets`

```
This add-on synchronizes user-edited Google Sheets back into Markdown files in the user's own GitHub repository. When an onEdit installable trigger fires, we must read the entire target sheet (header row + data rows) to reconstruct a YAML frontmatter + Markdown table. The .currentonly variant cannot be used because installable triggers do not run in the user's interactive context, so the active spreadsheet handle is unavailable; we must open the spreadsheet by ID stored in user properties. Read/write access is required because the round-trip also writes back DataValidation and ConditionalFormat rules derived from the Markdown column schema. The add-on never accesses any spreadsheet the user has not explicitly opted in by configuring its ID in the sidebar.
```

### `auth/script.external_request`

```
The add-on commits the Markdown export of the active sheet to the user's own GitHub repository via the GitHub REST API (PUT /repos/{owner}/{repo}/contents/{path}). The destination repository, branch, and file path are configured by the user in the sidebar and stored in PropertiesService.getUserProperties() within the user's Google account. The add-on transmits data only to the GitHub host configured by the user (api.github.com by default); it does not send data to any first-party md-business server, analytics endpoint, or third party. No external request is made unless the user has both stored a GitHub Personal Access Token and explicitly enabled auto-sync.
```

### `auth/script.scriptapp`

```
The add-on lets the user enable and disable an installable onEdit trigger that watches the active spreadsheet for edits and pushes them to GitHub. Creating, listing, and deleting that trigger requires ScriptApp.newTrigger() / ScriptApp.getProjectTriggers() / ScriptApp.deleteTrigger(), which are gated by the script.scriptapp scope. The trigger is registered only when the user clicks "Enable auto-sync" in the sidebar and is removed when they click "Disable". The add-on does not create triggers in any other spreadsheet.
```

---

## 提出前チェックリスト（PdM 用）

- [ ] 詳細説明の見出しを Marketplace の貼付フォーマットに合わせて整形（Markdown 記法を除去）
- [ ] アイコン PNG 3 サイズ用意（32 / 96 / 128。既存 `apps/chrome-extension/public/icons/icon-128.png` をリサイズ流用可）
- [ ] スクリーンショット 1280×800 PNG を 3 〜 6 枚用意（Workspace アドオン用、Chrome 拡張用とは別撮影）
- [ ] YouTube デモ動画（任意・推奨）を unlisted で公開
- [ ] サポート / プライバシー / 利用規約 URL が `200` を返すことを確認（本 PR merge 後、main の raw URL）
- [ ] OAuth consent screen の設定値と本草案のスコープ説明が一致していることを確認
- [ ] OAuth consent screen の **「アプリの確認」用フィールド** に上記「OAuth 検証申請 — スコープ用途説明」3 件を貼り付け
- [ ] OAuth consent screen の **「アプリのデモンストレーション動画」** に YouTube URL を貼り付け
- [ ] 配信先 GitHub アカウント (`meta-taro`) のリポジトリが public で初期コミット以降が表示されていることを確認

すべてチェック後、Marketplace SDK → 「公開ステータス」→「**ドラフトを保存**」→「**確認のために送信**」。Sensitive scope 3 件のため Google レビューは **5〜7 週** を想定。
