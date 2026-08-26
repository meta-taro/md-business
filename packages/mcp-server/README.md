# @md-business/mcp-server

md-business の **MCP（Model Context Protocol）サーバー**。Claude Desktop / Claude Code / Cursor / Cline などの AI エージェントが、Markdown 業務文書（適格請求書・基本設計書・検証シート・DB 設計書・API 詳細設計書・調査報告書）を**正本として直接**読み書き・検証・検索できるようにする Node sidecar（stdio 接続）。

アーキテクチャは Tauri Desktop から起動する Node sidecar（stdio 接続）。

## 提供ツール（P0）

| ツール | 役割 |
|---|---|
| `list_schemas` | 扱える業務文書スキーマの一覧（id + 日本語ラベル）を返す |
| `get_schema` | スキーマ id を指定して JSON Schema 本体（必須項目・型・選択肢）を返す |
| `read_document` | 相対パスの文書を読み、frontmatter / body / 検出スキーマを返す |
| `validate_document` | 既存文書を宣言スキーマで JSON Schema 検証（schema 未宣言は invalid 扱い） |
| `create_document` | 構造化 frontmatter + 本文から新規作成。schema 宣言キーを種別ごとに自動注入。既存パスは上書きしない |
| `update_document` | frontmatter（浅くマージ）／本文を更新。更新後スキーマで再検証し、更新前後の行 diff を返す |
| `search_documents` | 全文クエリ・スキーマ・日付範囲で検索し、path / kind / schema / title / date / 抜粋を返す。文書と検証シートの両方を一覧できる |
| `read_tsv` | 検証シート（カスタム TSV）のメタ情報・列定義（型 / 必須 / 選択肢）・データ行・列型の検証結果を返す |
| `append_tsv_row` | 検証シートの末尾に 1 行追加。値は列名キーで指定し、未指定の列は空セルのまま |
| `update_tsv_row` | 検証シートの既存 1 行のうち、指定した列だけを差し替える |
| `read_data` | 外部から届いた JSON / XML を木構造として読む（読むだけ）。`at` で節を指し、`depth` で世代数を絞れる |
| `data_to_table` | JSON / XML の繰り返し（配列・同名要素の並び）を Markdown の表に写す。出典行つきの文字列を返すだけで、ファイルには書かない |
| `search_lines` | ログなどを正規表現で行検索し、一致行を行番号つきで返す（前後の行も取れる）。全文は読み込まない |
| `read_lines` | 行範囲（1 始まり・両端含む）を行番号つきで返す。`search_lines` で見つけた箇所の周辺を読む |
| `filter_records` | 1 行 1 レコードのログ（JSONL / TSV）を条件で絞る。条件は演算子の組み合わせで指定し、式は受け付けない |
| `aggregate` | 絞り込んだレコードを時間帯別・キー別に数える。「いつ・何が・何件」を、中身を読む前に掴むためのもの |
| `build_timeline` | 別々のログの行を時刻順に 1 本へ混ぜる。どの行も出どころと行番号を持ったまま並ぶ |
| `save_evidence` | 取り出した中身を Evidence として 1 件 1 ファイルに残し、報告書から書く参照を返す。既にあるものは上書きしない |
| `declare_web_mode` | フォルダが web モードを名乗る宣言を `md-business.yml` に置く／取り下げる。名乗るだけで、script を動かす許可にはならない |
| `write_site_file` | サイトの部品（HTML / CSS / JS など）を 1 ファイル書く。web モードを名乗っているフォルダでだけ書ける |
| `read_site_file` | サイトの部品を 1 ファイル読む。置いてあるままを返す（伏せ字も切り詰めもしない）ので、直して書き戻せる |
| `git_status` | ワークスペースの変更状況（ブランチ・upstream との差・変更ファイル一覧）を返す |
| `git_diff` | HEAD と作業ツリーの差分を unified diff で返す。パス指定で 1 ファイルに絞れる |
| `git_commit` | 変更をステージしてコミットする（push はしない）。コミットハッシュと最新の変更状況を返す |
| `open_document` | デスクトップアプリの表示を対象文書に切り替える。印刷は伴わない |
| `list_open_documents` | デスクトップアプリで今開いている文書の一覧を返す。どれが手前か、保存していない編集が残っているかも分かる |
| `close_document` | デスクトップアプリで開いている文書を閉じる。未保存の編集は先に保存してから閉じる |
| `export_pdf` | デスクトップアプリで対象文書を開き、PDF 出力（印刷）ダイアログを表示する |

対応スキーマ: `invoice/v1` / `spec/v1` / `test-spec/v1` / `db-spec/v1` / `nosql-db-spec/v1` / `api-spec/v1` / `investigation/v1`。

検証シートは Markdown ではなくカスタム TSV（1 レコード = 1 物理行）なので、`read_document` 系ではなく
TSV 系ツールで扱う。どのシートがあるかは `search_documents` の `kind: "sheet"` で分かる
（見出しは `# タイトル:` のメタ行から拾う）。行単位で書き込むため、触っていない行は差分に出ない。
列型に反する値は書き込んだうえで `issues` として返す（記入途中の状態を許容するため）。
1 セルは 64,000 文字、1 ファイルは 4,000,000 文字までを扱う（超える入力はファイルを書き換えずに失敗させる）。
同じシートへの並行呼び出しはサーバー内で順番に処理するので、まとめて依頼しても行は消えない。

`open_document` / `list_open_documents` / `close_document` / `export_pdf` はデスクトップアプリから
起動したときだけ提供される（単体起動には切り替える画面が無いため）。指定できるのは今アプリで開いているフォルダの中だけで、
外を指すと断り文にそのフォルダ名が入る。別のフォルダへ勝手に切り替えることはしない
（人が編集している最中に表示が飛ぶと、依頼した側からは飛ばしたことが見えない）。
`export_pdf` は保存先の指定と保存操作を利用者が行うので、返るのは「印刷ダイアログを開けたか」まで。
`close_document` が閉じられるのは今開いている文書だけで、開いていないものを頼まれたらそう返す
（黙って成功にすると、依頼した側は閉じたつもりのまま次へ進む）。未保存の編集を書けなかったときは
閉じずに残し、失敗として返す。

JSON / XML は正本ではないので `read_data` は読む口だけを出す（書き戻しは用意しない）。既定では根から
2 世代までを返し、深さで切った節には `omittedChildren`（返さなかった直下の子の数）が付く。続きは
`at: ["取引先","住所"]` のように降りて取る。子を黙って落とすと「子が無い」と区別できないため、
隠した数は必ず添える。

明細のような繰り返しを文書へ引用するときは `data_to_table` を使う。`at` で指した節の子が 1 行になり、
列は行に現れた順の和、その行に無い項目は空セルのまま。セルの `|` は退避し、改行とタブは空白へ畳む
（Markdown の表はセル内改行を持てない）。表に出せないものは黙って落とさず、`nestedColumns`
（さらに子を持つ項目）/ `multiValuedColumns`（1 行に複数現れ先頭だけ載せた項目）/ `truncated`
（上限で載せなかった行数）で返す。木から自前で表を組むと列の抜けや桁ずれが起きるが、
壊れた表は読める形をしているので気づかれない。

ログは業務文書ではないので、文書ツールとは別の口（`search_lines` / `read_lines` / `filter_records` /
`aggregate` / `build_timeline`）で扱う。
共通の約束が 3 つある。**戻り値には必ず伏せ字がかかる**（Authorization / Cookie / token / api_key /
password / メールアドレス / カード番号らしき数字列。外す指定は用意しない。生の値が要るなら人がファイルを
開く）。**上限で切ったら切ったと返す**（`truncated`）。**全文はメモリに載せない**（1 行ずつ流す）。

`filter_records` の条件は `field` と演算子（`eq` / `ne` / `contains` / `startsWith` / `endsWith` /
`gt` / `gte` / `lt` / `lte` / `exists` / `missing` / `matches`）の組み合わせで書く。**式は受け付けない**
（文字列を評価する作りにすると、ツールの権限がそのまま任意コード実行になる）。絞り込みは伏せ字の**前**の
値に当たるので、メールアドレスのような伏せ字対象の値でも探せる。両辺が数として読めるときだけ数として比べ、
それ以外は文字列として比べる。読めなかった行は落とさず `skipped` に数える。形式は拡張子
（`.jsonl` / `.ndjson` / `.tsv`）から決め、判らなければ推測せず `format` の指定を求める。

`aggregate` は同じ条件で絞ったうえで件数だけを返す。`groupBy` に項目名を並べるとキー別に、`timeField` を
指すと時間帯別（`bucket` は `day` / `hour` / `minute` / `second`・**UTC で切る**）に数え、両方を混ぜられる。
**時刻は読めた形式だけを読む**（ISO 8601 とその近縁）。読めなかった行を落とすと「その時間帯には何も
起きていない」に見えてしまうため、落とさず `時刻不明` として残し、合計に含める。数値の時刻は桁数から
単位を当てずに `epoch`（`seconds` / `milliseconds`）の指定を求める（当てに行くと 1970 年や 58000 年に
静かに着地する）。**数え上げは伏せ字の前の値で行い、伏せ字はキーを返す直前にかける**（先に伏せると、
伏せ字が同じ形になった別人が 1 つのキーに混ざって件数が狂う）。切ったことは 2 通りで返す。`truncated`
は返すキーの数を `maxGroups` で絞ったこと、`groupLimitReached` と `droppedRecords` は持てるキーの種類の
上限に当たったこと（ID のような 1 件 1 キーの項目で集計されたとき）。どちらの場合も `total` は全件の数のまま。

`build_timeline` は複数のログを時刻順に 1 本へ混ぜる。時刻の項目名はファイルごとに違うので `sources` の
各要素で指定し、`label` を付けると出どころの表示名になる。**混ぜても出どころを消さない**（各行が
`source` / `path` / `line` を持つ）。並びだけを見て因果を読み、元の行に戻れなくなるのを避けるため。
読めなかった時刻は落とさず `time: null` として末尾に付ける（時刻の位置には置けないが、消せば
「その時間帯には何も起きていない」に見える）。`from` / `to` の窓は**読めた時刻にだけ効く**ので、
窓を指定しても時刻不明の行は残る。上限に当たったときは `truncated` と、どのファイルで切ったかを
`sources[].truncated` で返す（窓を狭めて取り直す判断ができるように）。

`save_evidence` は、調べて取り出した中身のうち報告書の根拠にするものを `docs/investigations/evidence/`
へ 1 件 1 ファイルで残す。返る `reference`（`evidence/EV-001.md`）は `docs/investigations/` に置いた
報告書からそのまま書ける相対パス。番号は空いている次のものを自動で振り、`id` で明示もできるが、
**既にある Evidence は上書きしない**（報告書の参照はそのままで中身だけが差し替わると、記録として
成立しなくなる）。保存する前に伏せ字を通すので、調査の途中で伏せていた値が成果物になった瞬間に
出ることはない。どのツールで取り出したか（`tool`）と元にしたファイル（`sources`）は必須で、
出どころの無い塊は受け取らない。

`declare_web_mode` と `write_site_file` / `read_site_file` は、業務文書ではなく **サイトの部品**
（HTML / CSS / JS など）を扱うための 3 本。既定のフォルダは業務文書として扱われ、サイトの部品は一覧に出ない。`declare_web_mode` で
`md-business.yml` に `mode: web` を置くと一覧に出るようになり、そこで初めて `write_site_file` が書ける。
**名乗りは「そう扱ってほしい」という宣言であって、script を動かす許可ではない**（許可は利用者が自分の PC で
1 回与えるもので、リポジトリには入らない）。名乗っていないフォルダで書き込みを断るのは、置いても一覧に出ず、
書いた側にも確かめる手段が無いため。`.md` と `.tsv` はそれぞれ専用の口があるので `write_site_file` では書けない。
中身は渡されたまま置く（組み立て直さない）ので、意図どおりかはブラウザで見て確かめる。
既にあるファイルを直すときは `read_site_file` で読んでから書き戻す。こちらも置いてあるままを返す——
伏せ字や行の切り詰めが混ざると、書き戻した時点で触っていないはずの箇所まで書き換わってしまう。

git 系ツールはワークスペースが git 管理されているときだけ意味を持つ（管理外なら理由付きで失敗する）。
未追跡ファイルは HEAD との差分が出ないため、`git_diff` は `untracked: true` を返す（中身は `read_document` で読む）。

> **`git_push` は MCP ツールとして提供しない**（push は人間が最終確認する運用のため）。
> **secrets / API キーは MCP サーバーが受け取らない**（人間が直接投入する）。

## ビルド

```bash
pnpm --filter @md-business/mcp-server build
```

`dist/bin.js`（stdio モードの実行エントリ）が生成される。

デスクトップアプリへ同梱する単一ファイルは別コマンドで作る。

```bash
pnpm --filter @md-business/mcp-server bundle
```

`dist-sidecar/sidecar.cjs` が生成される（依存を内包した 1 ファイル。配布物に
node_modules を含めずに済ませるため）。

## Claude Desktop への接続

`claude_desktop_config.json`（macOS: `~/Library/Application Support/Claude/`、Windows: `%APPDATA%\Claude\`）へ以下を追記する。`<repo>` は md-business のクローン先絶対パス、`<workspace>` は業務文書を置くフォルダの絶対パス。

```json
{
  "mcpServers": {
    "md-business": {
      "command": "node",
      "args": [
        "<repo>/packages/mcp-server/dist/bin.js",
        "<workspace>"
      ]
    }
  }
}
```

Claude Desktop を再起動すると、md-business のツールが利用可能になる。

### つながらないときの確認

クライアント側に出るのは「接続できません」だけなので、原因はサーバーを直接動かして切り分ける。
どちらの指定も待ち受けには入らず、結果を出して終わる。

```bash
node dist/bin.js --version           # 起動できるか・どの版か
node dist/bin.js --health <workspace> # 設定の点検
```

`--health` は、指したフォルダを読めるか・スキーマを組み立てられるか・何件見えているかを
1 行ずつ出す。すべて通れば終了コード 0、1 つでも駄目なら 1 で終わる。

```
OK  ワークスペース: /Users/me/docs
OK  スキーマ: invoice/v1 / spec/v1 / test-spec/v1 / db-spec/v1 / nosql-db-spec/v1 / api-spec/v1 / investigation/v1
OK  文書: 文書 13 件 / 検証シート 2 件
```

デスクトップアプリに同梱したサイドカー（`sidecar.cjs`）でも同じ指定が使える。
クローンせずにアプリだけを入れた場合は、そちらで確かめる。

### ワークスペース root の解決順

1. 第1引数（上記 `args` の `<workspace>`）
2. 環境変数 `MD_BUSINESS_WORKSPACE`
3. カレントディレクトリ

指定 root の外へのアクセスは拒否される（多重防御）。

### 扱えないファイル名

root 配下でも、以下は拒否する（OS を問わず同じ判定）。

- コロンを含む名前（`a.md:x`）… NTFS では本体ファイルの裏側へ入り、ファイル一覧に現れない
- 予約デバイス名（`CON` / `NUL` / `COM1` / `LPT1` … 拡張子の有無を問わない）… 作れはするが、
  エクスプローラや多くのエディタから開けず削除もしづらい

### 上書きの原子性

`write` は同じディレクトリへ一時ファイル（`.partial` で終わる名前）を書いてから `rename` で
差し替える。行単位の書き込みは全文を読んで全文を書き戻すため、直接上書きすると途中で
落ちた 1 回でファイル全体を失いうる。一時ファイルは監視対象の拡張子（`.md` / `.tsv`）を
避けてあるので、デスクトップのファイル一覧には現れない。

## HTTP モード（アプリ組み込み）

デスクトップアプリは `dist-sidecar/sidecar.cjs` を子プロセスとして起動し、AI
クライアントは `http://127.0.0.1:<port>/mcp` へ bearer トークン付きで接続する。

```bash
node dist-sidecar/sidecar.cjs <workspace> [<接続情報の保存先>]
```

このモードでは MCP 本体が HTTP に乗るため、stdin / stdout は親プロセスとの制御
チャネルとして使う（改行区切りの JSON、1 行 1 メッセージ）。

| 向き | 種別 | 内容 |
|---|---|---|
| 子 → 親 | `ready` | `url` / `port` / `token` / `root`。listen 完了後に 1 度だけ |
| 子 → 親 | `log` | ツール実行 1 件の記録（ツール名・相対パス・成否・時刻） |
| 子 → 親 | `root` | `set-root` を受理し、解決した root を返す |
| 子 → 親 | `error` | 制御行の解釈失敗など。サーバー本体は動き続ける |
| 親 → 子 | `set-root` | ワークスペース root の差し替え |

stdin が閉じるとサイドカーは自分で終了するので、親が落ちても孤児プロセスは残らない。

### 接続情報の保存（トークン / ポート）

第 2 引数（または環境変数 `MD_BUSINESS_MCP_STATE`）に保存先を渡すと、確定した
トークンとポートをその JSON ファイルへ残し、次回起動時に読み直す。AI クライアント
側へ貼った接続設定を、起動のたびに書き直さずに済ませるため。

```json
{
  "token": "<64 桁の 16 進>",
  "port": 51763
}
```

- ファイルは所有者のみ読み書きできる権限（`0600`）で書く。
- 保存先を渡さない・読めない・壊れている場合は、その場でトークンを発行して
  ポートは OS 任せにする（従来どおり起動はできる）。
- 保存済みのポートが他プロセスに使われていたら OS 割当へ切り替え、確定した
  ポートを保存し直す。
- トークンを作り直したいときはこのファイルを消す。次の起動で新しい値になる
  （貼り済みの設定は入れ替えが要る）。

トークンそのものは引数にも環境変数にも載せない（引数はプロセス一覧から見えるため）。
渡すのは保存先のパスだけで、値を知れるのは子プロセスの stdout を読める親と、
ファイルを読める利用者本人に限られる。

## 動作確認（手動スモーク）

ビルド後、stdio で initialize + tools/list ハンドシェイクを流す:

```bash
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
  | node dist/bin.js "$(pwd)"
```

`serverInfo` とツール一覧が stdout に JSON-RPC で返れば正常。ログは stderr にのみ出る（stdout は MCP プロトコル専用チャネル）。

## テスト

```bash
pnpm --filter @md-business/mcp-server test:run
```

決定ロジック（diff / search / registry / tools / workspacePath / control）は純関数として単体テスト、SDK 配線は `InMemoryTransport` + `Client` で end-to-end 検証する。バンドル済みサイドカーは実際に子プロセスとして起動するスモークテストで確認する（依存の取りこぼしや CJS/ESM の食い違いは単体テストでは出ないため）。

## 設計メモ

- 検証器は各 schema パッケージの JSON Schema から**実行時に Ajv2020 でコンパイル**する。schema パッケージが公開する standalone compiled validator は bundler / Apps Script 向けで生 Node ESM では解決できないため、MCP（CSP 制約のない Node sidecar）側で runtime Ajv を使う。schema パッケージ自体には手を入れない。
- I/O は `DocumentStore` インターフェース越し。本番は `FileDocumentStore`（node:fs）、テスト・dry-run は `MemoryDocumentStore`。
