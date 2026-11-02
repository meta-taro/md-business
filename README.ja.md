# md-business

[![CI](https://github.com/meta-taro/md-business/actions/workflows/ci.yml/badge.svg)](https://github.com/meta-taro/md-business/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-yellow.svg)](./LICENSE)
[![Node.js 24 LTS](https://img.shields.io/badge/node-24%20LTS-brightgreen.svg)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-required-F69220.svg)](https://pnpm.io/)
[![Chrome Web Store](https://img.shields.io/badge/Chrome%20Web%20Store-published-4285F4.svg)](https://chromewebstore.google.com/detail/lmdplkkfmgapnhombimeohjliinifgjh)
[![VS Code Marketplace](https://img.shields.io/badge/VS%20Code%20Marketplace-published-007ACC.svg)](https://marketplace.visualstudio.com/items?itemName=meta-taro.md-business-vscode)

**[⬇ デスクトップアプリをダウンロード](https://meta-taro.github.io/md-business/download/)**（Windows / macOS）— インストーラです。ビルドは要りません。ブラウザで読んで印刷するだけなら [Chrome 拡張](https://chromewebstore.google.com/detail/lmdplkkfmgapnhombimeohjliinifgjh)、コードを書くエディタで検証・プレビューするなら [VS Code 拡張](https://marketplace.visualstudio.com/items?itemName=meta-taro.md-business-vscode)もあります。

> [English](./README.md) | **日本語**

> Markdown を真の正本（source of truth）として扱う、AI ネイティブな業務文書フレームワーク。

**md-business** は、業務文書を Markdown ファイルとして管理するためのオープンソースフレームワークです。frontmatter による構造化メタデータ、JSON Schema によるバリデーション、Git による履歴管理、そして人間向けの各種ビューワーを備えています。

単なる Markdown ビューワーでも、PDF ジェネレータでも、テンプレート集でもありません。

md-business は、請求書・検証シート・基本設計書・API 仕様書・DB 設計書・見積書・議事録など、あらゆる業務文書の正本フォーマットとして Markdown を採用します。AI agent はこれらの文書を直接生成・編集・検証・差分管理・レンダリングでき、人間は PDF / Google Workspace / Chrome / VS Code / PWA / デスクトップアプリ / GitHub など、慣れた使い方でレビュー・承認できます。

## なぜ存在するのか

ほとんどの業務文書は、いまだに「人間が使うために設計されたツール」の中に閉じ込められています：

- ワードプロセッサ
- 表計算ソフト
- PDF
- クラウドドライブ
- Office スイート
- SaaS バックオフィスツール
- 社内 Web フォーム

これらは人間の入力・レビューには有用ですが、**AI agent が直接操作できる正本** としては最適ではありません。

AI agent はこれらの文書を読み取って要約することはできても、構造化された業務資産として「安全かつ継続的に運用する」のは苦手です。信頼できる編集、バリデーション、差分管理、バージョン管理、自動化、複数 agent・複数システム間の引き継ぎ——どれもうまく扱えません。

md-business はまったく別の前提から出発します：

**業務文書は、AI agent が直接操作できる形式で保存されるべきだ。**

Markdown が人間が読める本文を担い、
YAML frontmatter が機械可読なメタデータを担い、
JSON Schema がバリデーションを担い、
Git が履歴・レビュー・ブランチ・ロールバックを担い、
レンダラーとビューワーが人間向けの出力を担います。

## コアアイデア

```text
Markdown による正本
        ↓
スキーマバリデーション
        ↓
AI agent による編集
        ↓
Git diff / レビュー / 承認
        ↓
PDF / Sheets / Docs / ブラウザ / デスクトップ / SaaS 連携
```

重要なのは **Markdown による正本のレイヤー** です。

ビューワーや各種連携は、人間や既存ワークフローのためのアクセスポイントに過ぎません。Markdown や Git や AI agent を理解しなくても、現場の人がレビュー・承認・印刷・共有・提出できるようにするためのものです。

## md-business は何か

md-business は次のものです：

- スキーマ駆動の業務文書システム
- Markdown ファーストの正本レイヤー
- AI agent のために設計された文書フォーマット
- 不透明な Office ファイルに代わる、Git フレンドリーな選択肢
- AI ワークフローと、人間向け業務文書をつなぐブリッジ
- ローカルファースト・agent 駆動の業務運用基盤

## md-business は何でないか

md-business は次のものではありません：

- Notion クローン
- Google Docs クローン
- 表計算ソフトの代替
- 単なる Markdown ビューワー
- PDF 生成専用ツール
- クローズドな SaaS ワークフローツール

既存の Office スイートや SaaS ツールは、レビュー面・配信チャネル・規制対応バックエンドとしては引き続き有用です。md-business が担うのは、**AI agent が実際に運用できる正本レイヤー** です。

## なぜ Markdown なのか

Markdown は AI ネイティブな業務運用の基盤として現実的です。理由は次のとおり：

- AI agent が信頼性高く編集できる
- 人間も特別なソフトなしに読める
- Git が変更を追跡できる
- Pull Request でレビュー・承認できる
- frontmatter に構造化業務データを持てる
- JSON Schema で文書の正しさを検証できる
- レンダラーで PDF / HTML / Sheets / Docs などに出力できる
- ローカルリポジトリをデスクトップツールや自律 agent で直接運用できる

## 人間の役割

md-business は人間から責任を取り上げるものではありません。

「繰り返される文書操作」から人間を解放し、レビュー・承認・例外対応・ビジネス判断という、本来の役割に集中させます。

- AI agent が **正本ファイル** を運用する
- 人間が **結果** を承認する
- ビューワーが **インターフェース** を提供する

## 利用シーンの例

### 検証シート（テスト項目書）

AI agent が Markdown でテストケースを生成・更新し、スキーマが必須フィールドを検証、Git が変更を追跡。Google Sheets やブラウザのビューワーから、非エンジニアでもテストを実施・レビューできます。

### 基本設計書 / API 仕様書 / DB 設計書

AI agent が基本設計書・API 仕様書・DB 設計書・実装メモを、バージョン管理された Markdown として維持。Mermaid 図、構造化 frontmatter、スキーマバリデーションにより、レビュー可能かつ自動化可能な文書を保てます。

### 請求書 / 見積書

AI agent が日付・明細・税フィールド・取引先情報・支払条件などを Markdown 上で更新。スキーマが必須項目を検証し、PDF レンダラーが人間向けの最終文書を生成します。外部の会計ツールは「正本」ではなく「連携先」として扱えます。

## 配布チャネル

md-business は、複数の人間向けビューワーと自動化チャネルを提供します：

| チャネル                  | 役割                                                           | 状態   |
| ------------------------- | -------------------------------------------------------------- | ------ |
| Tauri デスクトップアプリ  | ローカルリポジトリの操作と、文書ワークフロー自動化を一体で提供 | 公開中 |
| Chrome 拡張               | ブラウザ上で Markdown 業務文書を開いてプレビュー               | 公開中 |
| Google Workspace アドオン | 慣れた Office ワークフローの中で文書をレビュー・表示           | 審査中 |
| VS Code 拡張              | 開発者・agent 向けの編集環境                                   | 公開中 |
| PWA                       | クロスプラットフォームの人間向けビューワー                     | 計画中 |
| GitHub Action             | CI バリデーションと自動レンダリング                            | 計画中 |
| LINE LIFF                 | モバイル中心の日本向け業務ワークフロー                         | 計画中 |

これらは **コアプロダクトではありません**。
Markdown 正本を取り巻く **アダプター** にすぎません。

## 現在のテンプレート

| テンプレート     | スキーマ            | 配置                                                             |
| ---------------- | ------------------- | ---------------------------------------------------------------- |
| 請求書・見積書・領収書 | `invoice/v1`    | [`templates/invoice/`](./templates/invoice/)（6 バリアント）      |
| 検証シート       | `test-spec/v1`      | [`templates/test-spec/`](./templates/test-spec/)                  |
| 基本設計書       | `spec/v1`           | [`templates/spec/`](./templates/spec/)                            |
| API 詳細設計書   | `api-spec/v1`       | [`templates/api-spec/`](./templates/api-spec/)                    |
| 調査報告書       | `investigation/v1`  | [`templates/investigation/`](./templates/investigation/)          |

### テンプレートの使い方

すべてのテンプレートはダミーデータのみで構成されています（実在の社名・登録番号・口座番号は含みません）。**ファイルをコピーして、値を書き換えるだけ** で利用できます。

**請求書テンプレート** (`templates/invoice/`):

- `standard.md` — 英語ベースライン（10% 単品）
- `standard-ja.md` — 日本語ベースライン（10% / 8% 混在・振込先口座・適格請求書発行事業者の登録番号 T+13 桁ダミー）
- `tax-exempt-ja.md` — 免税事業者向け（登録番号なし・インボイス経過措置 2023–2029 の注記つき）
- `inbound-eligible.md` — 多品目・標準税率と軽減税率を同時に検証できる例
- `quote-ja.md` — 見積書（`種別: 見積書`）。支払期限のかわりに有効期限を持つ
- `receipt-ja.md` — 領収書（`種別: 領収書`）。但し書きと、任意で出せる収入印紙欄つき

Chrome 拡張ビューワーで開く、または `@md-business/renderer-pdf` でレンダリングすると、コードを書かずに印刷品質の PDF が生成できます。

DB 設計書（RDB は `db-spec/v1`、NoSQL は `nosql-db-spec/v1`）はスキーマがあり、どのアプリでも開けますが、白紙のテンプレートはまだありません。[`examples/`](./examples/) の記入済みのものを写して使えます。今後、議事録・契約書・運用チェックリストなど、他の業務文書のテンプレートも追加予定です。

## 実例（中身の入った文書）

テンプレートが「白紙の型」なのに対して、[`examples/`](./examples/) には **中身の入った実物** を置いています。
架空の会社の「社内備品の貸し出し管理」という 1 つの案件を、基本設計書 → API 詳細設計書 → DB 設計書 → 検証シート → 請求書 → 調査報告書 と一通り書いたものです。文書どうしが互いを参照しているので、実際の案件でどう繋がるかがそのまま読めます。

会社名・登録番号・口座・社員コードはすべて架空です。**形を写して、値は写さないでください。**
詳しくは [`examples/README.ja.md`](./examples/README.ja.md) を参照してください。

## スクリーンショット

スクリーンショットは [`docs/screenshots/`](./docs/screenshots/) 配下に順次配置します。撮影規格（1280 × 800 px / PNG）と必要画像の一覧は [`docs/screenshots/README.md`](./docs/screenshots/README.md) を参照してください。配置予定:

- Chrome 拡張で適格請求書を表示している様子
- Chrome 拡張の A4 PDF 出力プレビュー
- Google Workspace Add-on で検証シートを Sheets 表示
- Google Workspace Add-on の「GitHub に push」サイドバー操作

現時点では Chrome Web Store の公開ページからビューワー画像を確認できます: <https://chromewebstore.google.com/detail/lmdplkkfmgapnhombimeohjliinifgjh>

## Fork & カスタマイズ

md-business は MIT ライセンスで、企業内 / コンサル案件 / 業種別ホワイトラベル配信のために **fork すること自体を歓迎する設計** です。fork 戦略・上流追従の運用・各サブパッケージのカスタマイズ余地・配布チャネル別の注意点は [`docs/fork-guide/`](./docs/fork-guide/README.md) を参照してください。

## 長期ビジョン

md-business が目指すのは、**業務文書を AI agent が運用できるようにする** ことです。

不透明な SaaS 画面・PDF・スプレッドシート・Office ファイルの上に AI を被せるのではなく、**構造化された Markdown をワークフローの中心に置く** という発想です。

これによって、これまでとは違う組織運営が可能になります：

- 文書がバージョン管理される
- 変更がレビュー可能になる
- AI agent が正本ファイルを直接操作できる
- 人間は慣れたビューワーから承認できる
- ローカルリポジトリが業務ワークスペースになりうる
- バックオフィスや上流の設計プロセスを、特定 SaaS に正本を閉じ込めることなく自動化できる

すべての業務ツールを置き換えるのが目標ではありません。

**業務文書の正本レイヤー** をオープンに、ポータブルに、レビュー可能に、自動化可能に、AI ネイティブにすること——それが md-business の目指すところです。

## ドキュメント

| スキーマ | 仕様書 | パッケージ |
| --- | --- | --- |
| 適格請求書（インボイス制度） | `invoice/v1` | [docs/spec/invoice-v1.md](./docs/spec/invoice-v1.md) → [packages/schema-invoice/](./packages/schema-invoice/README.md) |
| 基本設計書 | `spec/v1` | [docs/spec/spec-v1.md](./docs/spec/spec-v1.md) → [packages/schema-spec/](./packages/schema-spec/README.md) |
| 検証シート | `test-spec/v1` | [docs/spec/test-spec-v1.md](./docs/spec/test-spec-v1.md) → [packages/schema-test-spec/](./packages/schema-test-spec/README.md) |
| 検証シート（タブ区切り） | `test-spec-tsv/v1` | [docs/spec/test-spec-tsv-v1.md](./docs/spec/test-spec-tsv-v1.md) → [packages/schema-test-spec-tsv/](./packages/schema-test-spec-tsv/README.md) |
| API 詳細設計書 | `api-spec/v1` | [packages/schema-api-spec/](./packages/schema-api-spec/README.md) |
| DB 設計書（RDB） | `db-spec/v1` | [packages/schema-db-spec/](./packages/schema-db-spec/README.md) |
| DB 設計書（NoSQL） | `nosql-db-spec/v1` | [packages/schema-nosql-db-spec/](./packages/schema-nosql-db-spec/README.md) |
| 調査報告書 | `investigation/v1` | [packages/schema-investigation/](./packages/schema-investigation/README.md) |

仕様書があるものは、JSON Schema へのリンク、トップレベルフィールド一覧、YAML frontmatter のサンプル、バリデーション例が含まれます。

### デスクトップアプリ

デスクトップアプリ（Tauri 2 + SvelteKit）は、上の業務文書をすべて用途別ビューワーで開き、Markdown を左右 2 画面でライブ編集し、A4 PDF を出力します。

- **探す**: ファイル一覧の絞り込み欄に打つと、フォルダ内の Markdown と検証シートを表題・本文まで横断して探せます。一覧はサムネイルの格子にも切り替えられます。
- **読む**: プレビューを拡大・縮小できます（50〜300%、Ctrl/Cmd + `+` / `-` / `0`、Ctrl + ホイール）。印刷と PDF は常に 100% で出ます。
- **描く**: ```zumen``` は構成図に、```chart``` は隣の TSV から棒・折れ線・円グラフに、```data``` は隣の TSV を表として引用します。VS Code 拡張も同じものを描きます。Chrome 拡張は隣のファイルを読めないため、構成図だけを描きます。
- **新しく保つ**: 起動時に新しい版を確かめ、了承すると入れ替えます。Windows（x64 / ARM64）と macOS 向けを配っています。

- **ダウンロード**（Windows / macOS）: <https://meta-taro.github.io/md-business/download/>
- **操作マニュアル（日本語）**: <https://meta-taro.github.io/md-business/manual/ja/>
- **User guide (English)**: <https://meta-taro.github.io/md-business/manual/>

#### 内蔵 MCP サーバー

デスクトップアプリは、起動すると手元だけで待ち受ける MCP サーバーを立てます。AI クライアントは、アプリで開いているフォルダの業務文書を読み・検証し・探し・作り・直せます。

- つなぎ方は `MCP` タブから。**接続設定を開いているフォルダへ追加**で `.mcp.json` が書かれ、**接続設定を写す**でそのまま使える `mcpServers` の設定がクリップボードに入ります。接続情報は再起動しても変わりません。
- `about_md_business` は「ここで何ができるか」に、やりたいこと別の呼ぶ順で答えます。
- 文書: `list_schemas` / `get_schema` / `read_document` / `validate_document` / `create_document` / `update_document` / `search_documents`。検証シートは `read_tsv` / `append_tsv_row` / `update_tsv_row` で行単位に触るので、触っていない行は差分に出ません。`check_tsv` は行を読まずに壊れていないかだけを見ます。
- 外から届いた JSON / XML（請求書の交換形式・口座明細・会計サービスの書き出し）は読むだけです。`read_data` で木として読み、`data_to_table` で繰り返し部分を表として引用します。`read_har` は通信の記録を読みます。
- ログは全文を読みません。`search_lines` / `read_lines` で当たりの周辺だけ、`filter_records` / `aggregate` で JSONL / TSV のレコードを絞って数え、`build_timeline` で複数のファイルを時刻順に混ぜます。戻り値はトークン・Cookie・メールアドレスが伏せ字になります。`save_evidence` は抜粋を調査報告書から指せるファイルとして残します。
- サイトとして宣言したフォルダ（`md-business.yml`）では、`declare_web_mode` / `web_mode_status` / `list_site_files` / `read_site_file` / `write_site_file` でサイトの部品を直し、出来上がりはアプリにそのまま映ります。
- `open_in_app` は AI が書いた文書を画面に出し、`list_open_documents` / `close_document` で開いているタブを見て片付けます。`export_pdf` は印刷ダイアログまで出します（保存先は人が選びます）。`capture_window` はアプリの窓だけを撮ります。
- フォルダが git リポジトリなら `git_status` / `git_diff` / `git_commit` で変更を確かめて記録できます。`git push` はツールにしていません。
- 届く範囲はアプリで開いているフォルダだけで、待ち受けはループバックのみ、トークンが合わない要求は断ります。AI が書くと、ファイル一覧とプレビューは再読み込みなしで追従します。

詳しくは [packages/mcp-server/](./packages/mcp-server/README.md) を参照してください。

### 変更履歴

デスクトップアプリ・Chrome 拡張・VS Code 拡張・Workspace アドオンの 4 つは、版をそれぞれ独立に付けています。[CHANGELOG.md](./CHANGELOG.md) に各アプリの現在の版と、それぞれの履歴へのリンクがあります。

### 規約

- [データセル運用規約](./docs/data-cell-conventions.md) — 未入力セルは空のままが正本。表セルを `—` / `–` / `―` / `N/A` / `TBD` で埋めません。
- [図の元になる素の表](./docs/spec/snapshot-tsv-v1.md) — 取ってきた数字の置き場と列。`取得日時` / `取得元` を行ごとに持ち、取り直した数字は書き換えずに足します。

## クイックスタート

### 使う

ビルドも Node.js もパッケージマネージャも要りません。

1. **[デスクトップアプリをダウンロード](https://meta-taro.github.io/md-business/download/)**（Windows x64 / ARM64 の `.msi` / `.exe`、macOS `.dmg`）してインストールします。ブラウザで読んで印刷するだけなら [Chrome 拡張](https://chromewebstore.google.com/detail/lmdplkkfmgapnhombimeohjliinifgjh)でも足ります。
2. フォルダを開きます。frontmatter に `schema:` を持つ `.md` は種別ごとのビューワーで、`.tsv` の検証シートはグリッド編集で開きます。
3. ひな形から始めます。[`templates/`](./templates/) からコピーするか、検証シートならファイル一覧の ＋ から列プリセットを選んで作れます。
4. プレビューから A4 PDF を出力します。

以降は[操作マニュアル](https://meta-taro.github.io/md-business/manual/ja/)にあります。

これらの文書を AI に編集させるには、デスクトップアプリが動かしている MCP サーバーへ AI クライアントをつなぎます。右パネルの `MCP` タブで、**接続設定を開いているフォルダへ追加**すると `.mcp.json` が書かれ、それを読むクライアント（Claude Code など）は自分で拾います。別の場所に設定を置くクライアントなら、**接続設定を写す**でクリップボードへ写せます。どちらも中身は同じで、ポートとトークンは埋まった状態です。

```json
{
  "mcpServers": {
    "md-business": {
      "type": "http",
      "url": "http://127.0.0.1:<PORT>/mcp",
      "headers": { "Authorization": "Bearer <TOKEN>" }
    }
  }
}
```

`<PORT>` と `<TOKEN>` は同じパネルに出ていて、再起動しても変わりません。一度貼った設定を書き直さずに使い続けられます。トークンは接続の鍵なので、Git リポジトリで書き出した場合はアプリが `.mcp.json` を `.gitignore` へ追加します。サーバーはループバックにのみ待ち受け、トークンの合わない要求を拒否し、開いているフォルダの外へは届きません。

デスクトップアプリを使わず単体で動かす場合は [packages/mcp-server/](./packages/mcp-server/README.md) を参照してください。

### 開発する

[Node.js 24 以上](https://nodejs.org/)と pnpm（corepack 経由）が要ります。npm / yarn は使えません。デスクトップアプリをビルドする場合は、加えて [Tauri 2 の前提条件](https://v2.tauri.app/start/prerequisites/)（Rust ツールチェーンとプラットフォームの WebView）が要ります。

```bash
corepack enable
pnpm install
pnpm dev
```

変更を入れる前に、次がすべて通ることを確認します。

```bash
pnpm lint       # svelte-check（デスクトップ）/ tsc --noEmit（それ以外）
pnpm typecheck  # 同じ検査を独立したタスクとして実行
pnpm test:run   # Vitest（設定のあるパッケージはカバレッジ付き）
pnpm build      # 全パッケージ・全アプリ
```

詳細は [CONTRIBUTING.md](./CONTRIBUTING.md) を参照してください。

## コントリビュート

Issue・PR 歓迎です。新規スキーマや配布チャネルの追加方法は [CONTRIBUTING.md](./CONTRIBUTING.md) を参照してください。

## ライセンス

MIT — 自由にフォーク・カスタマイズしてください。上流に取り込まない派生リポ（例: `schema-invoice-custom`）も歓迎します。
