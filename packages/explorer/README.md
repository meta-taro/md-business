# @md-business/explorer

ファイル一覧（Explorer）の**判定と検索**をまとめたパッケージ。デスクトップアプリ・VS Code 拡張・
Chrome 拡張が同じ判定・同じ並びで一覧と検索結果を出せるように、ここに集約する。

## 位置づけ — 読まない・描かない

このパッケージは**ファイルを読まない**し、**画面を持たない**。ファイルの読み方（Tauri / VS Code の
workspace API / ブラウザの File System Access API）と描き方はアプリごとに違うので、呼び出す側が持つ。
ここにあるのは、読んだ中身を受け取って答えを返す関数だけ。

同じ処理をアプリごとに書くと、検索の当たりやサムネイルの作り直しの条件がアプリごとにずれる。

## 公開 API

| 関数 | 役割 |
|---|---|
| `fileKind(path)` | `markdown` / `tsv` / `image` / `zumen`（`*.zumen.yaml`）/ `yaml` / `other` |
| `contentHash(content)` | 内容の指紋。文字列でもバイト列でも同じ中身なら同じ値 |
| `thumbnailKey({ kind, hash, renderer, theme })` | サムネイルのキャッシュ鍵。描画の版（例 `zumen@0.3.3`）を含めるので、版上げで古い絵を出さない |
| `titleOf(kind, text)` | 一覧に出す題名（frontmatter の `title` / 最初の `#` 見出し / TSV の `# タイトル:` / zumen の最上位 `title`） |
| `indexWorkspace(files)` | 検索の前処理（題名・揃えた名前と本文）。ファイルが変わらない限り使い回せる |
| `searchIndex(index, query, options?)` | 前処理済みの索引を引く |
| `searchWorkspace(files, query, options?)` | 前処理と検索をまとめて行う |
| `readSampleIndex(raw, options?)` | zumen の `examples/gallery/index.json` を読む |
| `searchSamples(samples, query, options?)` | サンプルの検索 |
| `normalizeForSearch(text)` / `splitQuery(query)` | 検索語の揃え方 |
| `normalizeWithOffsets(text)` | 揃えた文字列と元の位置の対応（抜粋の切り出し用） |

## 検索の決まり

- 語は空白（全角含む）で分け、**すべて含むものだけ**当てる
- 全角英数・半角カナ・大文字小文字・カタカナとひらがなの違いは無視する（「サーバ」「さーば」「ｻｰﾊﾞ」は同じ）
- ワークスペース: ファイル名 > 題名 > 本文 の順に重く数える。フォルダ名・拡張子では当てない。本文は先頭 200,000 文字まで
- 同点はパスの符号位置の順（実行環境の言語設定に依らない）
- サンプル: 題名 > 名前 > 分類名 > 英語の題名 > 英語の分類名・用途 の順

## サンプル索引は信頼できない入力として読む

索引の `name` はそのまま `<name>.zumen.yaml` というファイル名になり、新規作成のコピー元・コピー先に使われる。
別のフォルダを指せる名前（`/` `\` `..`）、制御文字・見えない文字、URL で意味を持つ `%` `#`、Windows で作れない名前
（予約デバイス名 `CON` `NUL` など）、UTF-8 で 200 バイトを超える名前は捨てて `skipped` に数える。
大文字小文字・Unicode 正規化の違いだけの重複も、同じファイルになるので後の方を捨てる。
形の合わない入力では投げずに空の一覧を返す。件数（既定 2,000）と文字列の長さ（既定 500）にも上限を置く。
