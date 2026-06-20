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
md-business は **Markdown ファースト × 特化ビューワー × 多チャネル配信** の OSS シリーズです。本 Google Workspace アドオンは、Markdown と Google Docs / Sheets / Slides を **双方向で同期** する編集環境を提供します。

## こんな悩みに

- **Markdown で書いた業務文書を、Google ドキュメントで共同編集したい**
- **Sheets で編集した検証シートを、Git 管理可能な Markdown として保存したい**
- **請求書・基本設計書・検証シートをエンジニアと非エンジニアが同じデータで触りたい**
- **PDF への変換は Google ネイティブ機能で十分。md ⇔ ドキュメント の往復が欲しい**

## できること（v0.1.0 現在）

- **Markdown テーブル → Google Sheets**: サイドバーに Markdown テーブルを貼って「インポート」を押すと、現在のシートに書き込みます。
- **Google Sheets → Markdown テーブル**: 現在のシートを Markdown テーブルに変換し、サイドバーへ出力します（コピーして Git に貼り付け可能）。
- **Docs / Sheets / Slides** いずれの画面からも、右側パネルからアドオンを呼び出せます。

## できる予定（v0.2.0 〜、schema-test-spec 連動）

- **検証シート（テスト項目書）の双方向同期** — Sheets 上で OK / NG / 備考を編集すると、対応する `.md` に自動コミット
- **基本設計書テンプレートの Docs 反映** — Markdown の章立て・表・リストを Google Docs にコンバート
- **スライド変換** — `# slide` 区切りで Google Slides ページに自動分割

## このアドオンの位置づけ

md-business シリーズは **「Markdown が真実、各ビューワーは表現」** という設計思想です。本アドオンは Google Docs / Sheets / Slides を「特化ビューワー」のひとつとして扱い、**ファイル形式の主はあくまで Markdown** にとどめます。

PDF 出力は Google Docs / Sheets / Slides の **既存「ファイル → ダウンロード → PDF」機能** に任せ、本アドオンでは扱いません。手元の `.md` から印刷品質の PDF を作りたい場合は、姉妹プロダクトの Chrome 拡張 [md-business Markdown 業務文書ビューワー](https://chromewebstore.google.com/) をご利用ください。

## オープンソース

- **ソースコード**: https://github.com/meta-taro/md-business
- **ライセンス**: MIT
- **Issue / バグ報告**: https://github.com/meta-taro/md-business/issues
- **fork して各社カスタムを作る** ことを推奨。本家へのマージは強制しません。

## 権限とプライバシー

本アドオンは以下のスコープを要求します。すべて **「現在開いているドキュメントのみ」** に限定された非センシティブスコープです。

- `spreadsheets.currentonly` — 現在開いている Sheets のみ読み書き
- `documents.currentonly` — 現在開いている Docs のみ読み書き
- `presentations.currentonly` — 現在開いている Slides のみ読み書き
- `script.container.ui` — サイドバー UI の表示

**外部サーバへのデータ送信は行いません**（v0.1.0 時点。将来 GitHub commit 連携を追加する場合は別途追加スコープを宣言し、ユーザに明示します）。

詳細は [PRIVACY.md](https://github.com/meta-taro/md-business/blob/main/PRIVACY.md) をご確認ください。

## 想定ユーザー

- **エンジニア**: 業務文書を Git で管理したい・PR レビューで仕様変更を追跡したい
- **PdM / PjM**: 基本設計書や検証シートをエンジニアと共有しつつ、自分は Google Docs / Sheets で編集したい
- **個人事業主・小規模事業者**: 適格請求書を Markdown で版管理しつつ、必要に応じて Google Sheets で計算したい

## 動作要件

- Google Workspace アカウント（個人 Gmail / Workspace 法人 / 教育のいずれも対応）
- Google Docs / Sheets / Slides いずれかが利用可能であること
- 特別なソフトウェアのインストールは不要（ブラウザのみ）

## サポート

- バグ報告 / 機能要望: GitHub Issues
- 設計議論 / 雑談: GitHub Discussions
- セキュリティ脆弱性: SECURITY.md に記載のメールアドレス

## 今後のロードマップ

1. **v0.7.0** — 検証シート（schema-test-spec）双方向同期 + Marketplace 正式公開
2. **v0.8.0** — API 設計書 / DB 設計書スキーマ
3. **v0.9.0** — GitHub Action 連携（PR で md → Sheets diff コメント）
4. **v1.0.0** — Slides スキーマ

最新版は GitHub リポジトリ（リリースタブ）を確認してください。
```

> 約 2,950 文字（コードフェンス・見出し含む）。Marketplace は Markdown 不可なので、Console 貼付前に **見出しを「【】」へ置換**するか、改行のみで整形してください（PdM 作業）。

---

## カテゴリ

- 第一カテゴリ: **生産性向上**
- 第二カテゴリ: **ビジネスツール**

> Marketplace は 2 カテゴリ選択可能。検索性最大化のためこの組み合わせ。

---

## 用途タグ（Tags）

Marketplace SDK の「用途」「業種」の自由入力に貼り付け:

```
Markdown, GitHub, ドキュメント変換, 請求書, 適格請求書, インボイス, 基本設計書, 検証シート, テスト項目書, OSS, Git, 業務文書, 双方向同期
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

## 提出前チェックリスト（PdM 用）

- [ ] 詳細説明の見出しを Marketplace の貼付フォーマットに合わせて整形（Markdown 記法を除去）
- [ ] アイコン PNG 3 サイズ用意
- [ ] スクリーンショット 1280×800 PNG を 3 〜 6 枚用意
- [ ] サポート / プライバシー / 利用規約 URL が `200` を返すことを確認
- [ ] OAuth consent screen の設定値と本草案のスコープ説明が一致していることを確認
- [ ] 配信先 GitHub アカウント (`meta-taro`) のリポジトリが public で初期コミット以降が表示されていることを確認

すべてチェック後、Marketplace SDK → 「公開ステータス」→「**ドラフトを保存**」→「**確認のために送信**」。
