# @md-business/schema-test-spec-tsv

検証シート（test-spec）を **カスタム TSV** 形式で扱うためのパーサ / シリアライザ / バリデータ。
`@md-business/schema-test-spec`（md + frontmatter 版）の姉妹パッケージで、同じ検証シートを
**TSV という別の正本**として表現する。

## なぜ TSV か

- **Desktop で直接編集**: md-business Desktop アプリが列型に応じた入力ウィジェット
  （チェック / ラジオ / 日時ピッカー / プルダウン）をインライン描画し、QA 担当が
  Excel/Sheets を開かず検証を完結できる（Office/Workspace 代替）。
- **Excel/Sheets 互換はサブ要件**: `#` 始まりのメタ行はスプレッドシートにそのまま貼っても
  ただの文字列セルになり、データ行だけ表として使える。

## 設計の核心制約 — 1 レコード = 1 物理行

md-business の価値は **git diff / 履歴レビューが効く**こと。カスタム TSV も正本である以上、
セルにタブ・改行が混じっても行が分割されないよう、**バックスラッシュエスケープ**で畳み込む
（CSV 風のクォートは改行セルが複数物理行に跨り diff を壊すため不採用）。

| 実際の文字 | TSV 表記 |
|---|---|
| タブ U+0009 | `\t` |
| 改行 LF U+000A | `\n` |
| 復帰 CR U+000D | `\r` |
| バックスラッシュ | `\\` |

`escapeCell` / `unescapeCell` がこの変換を担う（`unescapeCell(escapeCell(x)) === x`）。

## 状態

Phase 1 実装中（Issue 010）。現状はエスケープ純関数のみ公開。
パーサ / シリアライザ / バリデーション / Desktop グリッドビューは順次追加。

## ライセンス

MIT
