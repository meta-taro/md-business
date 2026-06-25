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
md-business は **Markdown ファースト × 特化ビューワー × 多チャネル配信** の OSS シリーズです。本 Google Workspace アドオンは、Markdown と Google Docs / Sheets / Slides を **双方向で同期** し、さらに **検証シート（テスト項目書）を Sheets で編集して、サイドバーの「GitHub に push」ボタンで GitHub commit** する開発フロー連携を提供します（`git push` と同じメンタルモデル）。

## こんな悩みに

- **Markdown で書いた業務文書を、Google ドキュメントで共同編集したい**
- **Sheets で編集した検証シートを、Git 管理可能な Markdown として保存したい**
- **請求書・基本設計書・検証シートをエンジニアと非エンジニアが同じデータで触りたい**
- **PDF への変換は Google ネイティブ機能で十分。md ⇔ ドキュメント の往復と Git 連携が欲しい**

## できること（v0.7.1）

- **Markdown ⇄ Google Sheets 双方向変換**: サイドバーに `schema: test-spec/v1` の YAML frontmatter を含む md を貼り付けて「インポート」すると、列スキーマ（型 / enum / 日付 / チェックボックス / URL など）に従って DataValidation と ConditionalFormat が自動適用された Sheets に変換されます。md 本文の表もそのまま行データとして取り込まれます。Sheets を編集して「md 書き出し」を押すと、frontmatter + 表形式の Markdown へラウンドトリップで戻ります。
- **検証シート（test-spec）の列スキーマ強制**: enum 値の制約・日付バリデーション・必須列の検証を Sheets 上で即時フィードバック。サイドバーから「検証」ボタンで未知の列名・enum 違反・型不一致をまとめてレポートします。
- **そのまま使える列レイアウト**: frontmatter の `幅倍率` と `折り返し` 指定で、AI が作成した md でも Sheets 化時に「項目=狭め / 手順=広め / 備考=広め」の列幅と複数行折り返しが自動適用されます。**Gemini in Sheets と組み合わせると、開いた瞬間から自然な表として認識・整形してもらえます。**
- **フリー入力列のエラー抑制**: `必須: false` を指定した列は DataValidation 警告マーカーが付かないため、「実施日 = —」「担当 = TBD」などの自由記述もエラー扱いになりません。
- **GitHub Push（オプトイン）**: ユーザー自身が GitHub Personal Access Token を設定し、frontmatter の `repository: owner/repo@branch:path` で送信先を宣言した上で、サイドバーの「GitHub に push」ボタンを押すと、Sheets の現在の内容を `.md` として commit します。`git push` と同じメンタルモデルで、**保存したいタイミングだけ** 1 commit するため、編集中の中間状態で git 履歴が汚れません。コミットメッセージは frontmatter の `documentNumber` から自動生成します。
- **業務寄りのテンプレート内蔵**: 適格請求書 / 基本設計書 / 受発注ワークフロー検証シートのサンプルテンプレを内蔵。Markdown 初心者でも貼り付けるだけで雛形が動きます。
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

本アドオンは以下の 5 スコープを要求します。GitHub Push 機能のため、2 件は Google の **センシティブ（Sensitive）スコープ** に該当します。

センシティブスコープ:

- `spreadsheets` — 「GitHub に push」ボタン押下時に、アクティブシートを読み取って Markdown に変換するために必要です。`.currentonly` ではアクティブシート以外を扱えないため、広いスコープを要求します。
- `script.external_request` — GitHub REST API への HTTPS 通信（ユーザー設定の GitHub リポジトリへの commit）。**ユーザーが「GitHub に push」ボタンを押した時のみ実際に通信が発生します。**

非センシティブスコープ:

- `documents.currentonly` — 現在開いている Docs のみ読み書き
- `presentations.currentonly` — 現在開いている Slides のみ読み書き
- `script.container.ui` — サイドバー UI の表示

**送信先は GitHub のみ** で、送信先リポジトリ・ブランチ・パスはユーザーが frontmatter `repository:` で決定します。md-business 開発元を含む第三者にデータが渡ることはありません。「GitHub に push」ボタンを押さない限り、本アドオンは外部ネットワークと一切通信しません。

詳細は [PRIVACY.md](https://github.com/meta-taro/md-business/blob/main/PRIVACY.md) をご確認ください。

## 想定ユーザー

- **エンジニア**: 業務文書を Git で管理したい・PR レビューで仕様変更を追跡したい
- **PdM / PjM**: 検証シートを Sheets で関係者と共有しつつ、md として Git にも残したい
- **個人事業主・小規模事業者**: 適格請求書を Markdown で版管理しつつ、必要に応じて Google Sheets で計算したい

## 動作要件

- Google Workspace アカウント（個人 Gmail / Workspace 法人 / 教育のいずれも対応）
- Google Docs / Sheets / Slides いずれかが利用可能であること
- GitHub Push 機能を使う場合は GitHub アカウント + Personal Access Token（contents: write 権限）
- 特別なソフトウェアのインストールは不要（ブラウザのみ）

## サポート

- バグ報告 / 機能要望: GitHub Issues
- セキュリティ脆弱性: GitHub リポジトリ内 SECURITY.md を参照

## 今後のロードマップ

1. **v0.7.2** — 書式テンプレート参照（複数結果列〈Chrome / Safari / iOS / Android〉の書式重複解消）
2. **v0.8.0** — DB 設計書スキーマ（schema-db-spec / schema-nosql-db-spec）対応
3. **v0.9.0** — GitHub Action 連携（PR で md → Sheets diff コメント）
4. **v1.0.0** — Slides スキーマ

最新版は GitHub リポジトリ（リリースタブ）を確認してください。
```

> 約 3,400 文字（コードフェンス・見出し含む）。Marketplace は Markdown 不可なので、Console 貼付前に整形が必要です。**整形済みの平文版は [`docs/google-addon-marketplace-listing-plaintext.md`](./google-addon-marketplace-listing-plaintext.md) を用意済み** で、BEGIN/END マーカー間をそのまま Console へ貼り付けられます（Markdown 記法混入を vitest で自動チェック）。

---

## カテゴリ

- 第一カテゴリ: **生産性向上**
- 第二カテゴリ: **ビジネスツール**

> Marketplace は 2 カテゴリ選択可能。検索性最大化のためこの組み合わせ。

---

## 用途タグ（Tags）

Marketplace SDK の「用途」「業種」の自由入力に貼り付け:

```
Markdown, GitHub, ドキュメント変換, 請求書, 適格請求書, インボイス, 基本設計書, 検証シート, テスト項目書, テスト管理, OSS, Git, 業務文書, 双方向同期, GitHub Push
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

**サイズ**: 1280×800 PNG / 24-bit / アルファ無し / 最大 5〜6 枚
**作業フォルダ**: `.tmp/sshots/in/` (撮影元) → `.tmp/resize-screenshots.ps1` → `.tmp/sshots/out/` (1280×800 PNG)

### 撮影シーン案（v0.7.1 / 5 枚構成）

| # | シーン | 何を見せるか | 撮影手順 |
|---|---|---|---|
| 1 | **Before/After: md → Sheets セットアップ直後** | 検証シートの md (templates/test-spec/standard-ja.md) をサイドバーに貼り付けて「検証シート: セットアップ」を押した直後の画面。**列幅が自動最適化 / 複数行折り返し / 行色分け (OK 緑 / NG 赤 / 保留 グレー / 未実施 暗グレー) / 実施日列に赤マーカーなし** が一望できる構図 | スクショ範囲は Sheet 全幅 + サイドバー右側。サイドバーには成功メッセージ「N 列 / 本文 12 行 / DataValidation X 件 / ConditionalFormat Y 件 / 列幅 P 件 / 折り返し Q 件 を適用しました。」が見える状態で撮る |
| 2 | **検証シートのリッチさ** | 1 と同じシートを少しスクロールして「手順」「期待結果」「備考」の **複数行テキストが綺麗に折り返されている** ことが分かるアップ。NG 行の「警告は出るが承認待ちにならず確定してしまう」等のリアルな備考が映る | サイドバーは閉じて Sheet を全幅表示。3〜4 行が見える縦範囲 |
| 3 | **Gemini in Sheets 連携** | 同じシートで Gemini パネルを開いた状態。**「Gemini に表を整える」サジェスト**または「この検証結果をサマライズして」等の AI 連携の様子。OSS positioning 「AI-native business documents」の証拠 | Sheet 右側 Gemini パネルが開いた状態で撮影。今回 PdM が確認したショットを使用可 |
| 4 | **サイドバー UI 全景** | サイドバー側のフォーム（md 貼付エリア / セットアップボタン / PAT 保存 + 「GitHub に push」ボタン）を映す。md-business の使い方が一目で分かる | Sheet 左側を縮めてサイドバーが大きく見える構図 |
| 5 | **md ⇔ Sheets ラウンドトリップ** | Sheet で 1 行編集 → 「md 書き出し」→ サイドバーに更新済み md が表示される様子。frontmatter が保持されている部分が見えるとベスト | サイドバーに書き出した md が表示された状態 |

> Chrome Web Store 用スクショと同様の **白余白で 1280×800 にパディング** する方式が使えます（[`reference_chrome_web_store_screenshot_spec.md`](../../Users/syste/.claude/projects/C--claude-md-business/memory/reference_chrome_web_store_screenshot_spec.md) 参照）。`.tmp/resize-screenshots.ps1` をそのまま流用可能。
>
> 順序のおすすめ: 1 → 2 → 3 → 4 → 5（最初の 1 で「これは使える！」が伝わる構成）。Marketplace は先頭スクショが listing thumbnail になるため、**1 番が最も重要**。

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
This add-on lets the user export the active Google Sheet back into a Markdown file in the user's own GitHub repository by clicking a "Push to GitHub" button in the sidebar. When the user clicks the button, the add-on reads the entire active sheet (header row + data rows) to reconstruct a YAML frontmatter + Markdown table. The .currentonly variant cannot be used because the round-trip during setup also writes back DataValidation and ConditionalFormat rules derived from the Markdown column schema, and read/write access on the active spreadsheet is required for both directions. The add-on never accesses any spreadsheet other than the one the user is currently viewing.
```

### `auth/script.external_request`

```
When the user clicks the "Push to GitHub" button in the sidebar, the add-on commits the Markdown export of the active sheet to the user's own GitHub repository via the GitHub REST API (PUT /repos/{owner}/{repo}/contents/{path}). The destination repository, branch, and file path are configured by the user in the Markdown frontmatter (`repository: owner/repo@branch:path`). The user's GitHub Personal Access Token is stored in PropertiesService.getUserProperties() within the user's Google account. The add-on transmits data only to the GitHub host configured by the user (api.github.com by default); it does not send data to any first-party md-business server, analytics endpoint, or third party. No external request is made unless the user has both stored a GitHub Personal Access Token and explicitly clicked the "Push to GitHub" button.
```

---

## 提出前チェックリスト（PdM 用）

- [ ] 詳細説明を Marketplace Console の「詳細な説明」フィールドへ貼付（整形済みの [`google-addon-marketplace-listing-plaintext.md`](./google-addon-marketplace-listing-plaintext.md) の BEGIN/END マーカー間をそのままコピー）
- [ ] アイコン PNG 3 サイズ用意（32 / 96 / 128。既存 `apps/chrome-extension/public/icons/icon-128.png` をリサイズ流用可）
- [ ] スクリーンショット 1280×800 PNG を 3 〜 6 枚用意（Workspace アドオン用、Chrome 拡張用とは別撮影）
- [ ] YouTube デモ動画（任意・推奨）を unlisted で公開
- [ ] サポート / プライバシー / 利用規約 URL が `200` を返すことを確認（本 PR merge 後、main の raw URL）
- [ ] OAuth consent screen の設定値と本草案のスコープ説明が一致していることを確認
- [ ] OAuth consent screen の **「アプリの確認」用フィールド** に上記「OAuth 検証申請 — スコープ用途説明」2 件（`spreadsheets` / `script.external_request`）を貼り付け
- [ ] OAuth consent screen の **「アプリのデモンストレーション動画」** に YouTube URL を貼り付け
- [ ] 配信先 GitHub アカウント (`meta-taro`) のリポジトリが public で初期コミット以降が表示されていることを確認

すべてチェック後、Marketplace SDK → 「公開ステータス」→「**ドラフトを保存**」→「**確認のために送信**」。Sensitive scope 2 件（`spreadsheets` / `script.external_request`）のため Google レビューは **3〜5 週** を想定。
