# Test-Spec TSV Schema v1 — 検証シート（カスタム TSV）

先頭行 `#! md-business:test-spec-tsv/v1` で識別される、検証シート（テスト項目書）向けの **カスタム TSV** 形式の仕様。デスクトップアプリはこの形式のファイルを右ペインで **編集可能なグリッド**（表計算ライク）として開き、列型に応じた入力ウィジェット（プルダウン / ラジオ / 日付・日時ピッカー / チェックボックス）をインライン描画する。編集結果は同じ TSV 形式で書き戻される。

## 2 つの検証シート系統

検証シートには、同じ「テスト項目書」を別々の正本として表現する 2 系統がある。用途で選ぶ。

| 系統 | 識別子 | 正本ファイル | 主な編集経路 |
|---|---|---|---|
| Markdown + frontmatter | `schema: test-spec/v1` | `.md` | Google Sheets 連携（Chrome 拡張 / Google Workspace Add-on）。frontmatter の列定義が Sheets の DataValidation / ConditionalFormat に展開され、Sheets ⇄ md を双方向同期する。仕様は [`test-spec-v1.md`](./test-spec-v1.md)。 |
| カスタム TSV | `#! md-business:test-spec-tsv/v1` | `.tsv`（`.md` も可・後述） | **デスクトップアプリのグリッド編集**。TSV を直接編集し、TSV へ書き戻す。本ドキュメントが対象。 |

両者は独立した正本フォーマットであり、片方がもう片方へ自動変換されるわけではない。デスクトップのグリッド編集を使いたい場合はカスタム TSV を用意する（`schema: test-spec/v1` の Markdown はグリッドではなく読み取りプレビューで開く）。

## 一次ソース

パーサ / バリデータ / シリアライザの語彙・規則は以下の実装が正本。本ドキュメントと差異があれば実装が優先する。

- 行種別の判定: [`packages/schema-test-spec-tsv/src/classify.ts`](../../packages/schema-test-spec-tsv/src/classify.ts)
- セルのエスケープ / アンエスケープ: [`packages/schema-test-spec-tsv/src/escape.ts`](../../packages/schema-test-spec-tsv/src/escape.ts)
- 型付きヘッダの解釈: [`packages/schema-test-spec-tsv/src/header.ts`](../../packages/schema-test-spec-tsv/src/header.ts)
- 全体パース: [`packages/schema-test-spec-tsv/src/parse.ts`](../../packages/schema-test-spec-tsv/src/parse.ts)
- 型別バリデーション: [`packages/schema-test-spec-tsv/src/validate.ts`](../../packages/schema-test-spec-tsv/src/validate.ts)
- シリアライズ（書き戻し）: [`packages/schema-test-spec-tsv/src/serialize.ts`](../../packages/schema-test-spec-tsv/src/serialize.ts)
- 列型 / UI ヒントの型: [`packages/schema-test-spec-tsv/src/types.ts`](../../packages/schema-test-spec-tsv/src/types.ts)
- グリッド出し分けの判定: [`apps/desktop/src/lib/tsv/detect.ts`](../../apps/desktop/src/lib/tsv/detect.ts)
- 表ヘッダ拡張ディレクティブ（note / group）: [`apps/desktop/src/lib/tsv/gridHeaderDirectives.ts`](../../apps/desktop/src/lib/tsv/gridHeaderDirectives.ts)
- レイアウト永続化ディレクティブ（colwidth / rowheight / colmode）: [`apps/desktop/src/lib/tsv/gridLayoutDirectives.ts`](../../apps/desktop/src/lib/tsv/gridLayoutDirectives.ts)
- サンプル: [`templates/test-spec/standard-ja.tsv`](../../templates/test-spec/standard-ja.tsv)

## 最小導線

1. [`templates/test-spec/standard-ja.tsv`](../../templates/test-spec/standard-ja.tsv) を作業フォルダにコピーする。
2. そのフォルダをデスクトップアプリで開く。
3. ツリーからコピーしたファイルをクリックすると、右ペインに検証グリッドが開く。

先頭行のマジック `#! md-business:test-spec-tsv/v1` が付いていればグリッドで開く。ファイル拡張子は判定に使われない（後述）。

## 1. ファイル判別

グリッドで開くか読み取りプレビューで開くかは **内容ベース** で決まる。判定は「先頭の非空行が v1 マジック行か」だけを見る軽量関数（全文パースはしない）。

- 判定対象の先頭行は `#! md-business:test-spec-tsv/v1`。`#!` を剥がし前後空白を落とした値が `md-business:test-spec-tsv/v1` に一致すればグリッドで開く。
- マジックマーカー `#!` は **列 0（行頭・先頭空白なし）** のみ有効。
- 先頭の空行（空白・タブのみを含む行）は読み飛ばしてから判定する。
- **拡張子には依存しない**。ワークスペースは `.md` と `.tsv` の両方を開くため、`.md` でもマジック行があればグリッド、`.tsv` でもマジック行が無ければグリッドにはならない。
- 改行コードは `\r\n` / `\n` の両方に対応する（各物理行末の `\r` は除去して扱う）。

先頭行が `#!` で始まらない、または識別子が一致しない場合はグリッドにはならず、通常の文書プレビューへフォールバックする。

## 2. 行種別

各物理行の種類は **行頭（列 0）のマーカーだけ** で判別する。二文字マーカー（`#!` / `#@`）を一文字マーカー（`#`）より先に判定する。

| マーカー（列 0） | 種別 | 扱い |
|---|---|---|
| `#!` | magic | フォーマット識別行。最初の 1 本だけを採用する。 |
| `#@` | directive | 構造・レイアウトディレクティブ（`#@` を剥がし trim して収集）。 |
| `#` | meta | 文書メタ行（`キー: 値`）。 |
| （空白・タブのみ） | blank | 読み飛ばす。 |
| 上記以外 | data | 型付きヘッダ行（最初の 1 本）またはデータ行。 |

行頭に空白があるとマーカー扱いされず data 行になる（Excel / Sheets がコメントを「行頭 `#`」だけで判定するのと同じ挙動＝コピペ互換）。

data 行は tab 区切りで分割する。最初に現れた data 行を **型付きヘッダ**（列定義）として解釈し、以降を **データ行** として扱う。

## 3. メタ行

`# キー: 値` の形式。最初の `:` で分割し、キー・値をそれぞれ trim する。

- **キーは自由形式**。固定のキーセットは無く、メタ値のバリデーションもしない。
- コロンを含まない `#` 行（例: `# 見出しだけ`）は無視される（捨てられる）。
- 同一キーが複数あれば **後勝ち**。

テンプレートで使っている以下のキーは慣習であり、必須でも固定でもない。

| キー（慣習） | 用途 |
|---|---|
| `タイトル` | 検証シートの表題 |
| `文書番号` | 文書番号 |
| `版` | バージョン |
| `ステータス` | 進行状態（自由文字列。この形式では値を検証しない） |
| `凡例` | 結果列の記入ルールなどの注記 |

> Markdown 版（`test-spec/v1`）の `status` は 4 値の enum（draft / review / executing / completed）だが、それは Markdown 経路の話。カスタム TSV の `# ステータス:` は自由文字列で、パーサは値を検証しない。

## 4. `#@` ディレクティブ

`#@` 行は表示・レイアウトの拡張レイヤー。列定義（型付きヘッダ）とは別に、グリッドの見た目や補足を TSV に永続化する。パーサは `#@` を剥がした生文字列を順番に保持し、書き戻し時に復元する（round-trip）。

| ディレクティブ | 記法 | 効果 |
|---|---|---|
| note | `#@ note <text>` | 表の上に表示する全幅の補足行。複数指定可・記載順に表示。空文字の note は無視。 |
| group | `#@ group <start>[-<end>] <label>` | 列をまたぐグループ見出し。列インデックスは **0 始まり**・`end` は **包含**。単一列は `<start>` のみ。ラベル無し・逆順範囲（`end < start`）は無視。 |
| colwidth | `#@ colwidth <i>=<px> …` | 列 `i`（0 始まり）の幅を px で指定。空白区切りで複数列。 |
| rowheight | `#@ rowheight <i>=<px> …` | 行 `i`（0 始まり）の高さを px で指定。空白区切りで複数行。 |
| colmode | `#@ colmode <i>=<mode> …` | 列 `i`（0 始まり）の表示モード（折り返し等）を指定。 |

レイアウト系（colwidth / rowheight / colmode）は **sparse** に書き出される。既定値と同じ列 / 行は出力されないため、未調整のファイルにはレイアウト行が現れない（差分を最小化する）。範囲外インデックス・非数値・不正モードの指定は読み込み時に捨てられ、同種が複数あれば後勝ち。

### `#@ style` は予約（現行グリッドでは未描画）

`#@ style …`（条件付き書式・セル背景色など）は **将来用に予約** された記法で、**現行のグリッドには反映されない**。パーサは `style` 行を他のディレクティブと同様に温存し、保存時にそのまま書き戻すが、色付けを行う描画コードは無い。テンプレートに `#@ style 結果 OK=… …` の行が含まれていても、現時点では見た目に変化を与えず、round-trip で保持されるだけである。

## 5. 型付きヘッダ（列定義）

ヘッダ行の各セルは `列名[:型[(パラメータ)]][!]` の記法で列を定義する。

- 末尾の `!` は **必須列** マーカー。
- 型注記 `:<キーワード>` は **文末のみ** マッチする。列名の途中に `:` を含んでも、それが既知の型キーワードでなければ列名の一部として保持される（例: `補足:参考` は型注記にならず、全体が列名で型は `text`）。
- 型注記が無ければ既定は `text`。
- 括弧 `(...)` は **enum / radio でのみ有効**。それ以外の型に括弧を付けると注記が無効化され、セル全体が列名（type=text）として扱われる。

| キーワード | 内部型 | UI ヒント | 括弧パラメータ |
|---|---|---|---|
| `text` | text | — | 不可 |
| `multiline` | multiline_text | — | 不可 |
| `enum` | enum | — | 選択肢 `(A\|B\|C)` |
| `radio` | enum | ラジオ（常時展開） | 選択肢 `(A\|B\|C)` |
| `date` | date | — | 不可 |
| `datetime` | date | 日時ピッカー | 不可 |
| `number` | number | — | 不可 |
| `checkbox` | checkbox | — | 不可 |
| `url` | url | — | 不可 |

`text` は注記なしの既定なので、書き戻し時には型注記が付かず列名のみで出力される。列名・enum 選択肢はいずれもアンエスケープされる（構造記号 `: ( ) | !` はエスケープ対象外なので、人間可読部分だけがアンエスケープされる）。

例:

```
No.:number	項目	手順:multiline	結果:enum(OK|NG|保留|未実施)	実施日:date	担当	備考:multiline
```

## 6. enum / radio の選択肢

`(A|B|C)` を `|` で分割したものが選択肢になる。

- 空括弧 `()` は選択肢ゼロ。
- 各選択肢の値はアンエスケープされる。
- **選択肢の値そのものに `|` は含められない**。エスケープ対象は `\t \n \r \\` の 4 種のみで `|` はエスケープされないため、`|` は常に区切りとして解釈される。

## 7. セルのエスケープ

**1 レコード = 1 物理行** が絶対制約。セル内にタブや改行が混じっても行が分割されないよう、CSV 風のクォートではなく **バックスラッシュエスケープ** で畳み込む（クォートだと改行セルが複数物理行に跨り、行単位の差分が壊れるため）。

| 実際の文字 | TSV 表記 |
|---|---|
| タブ U+0009 | `\t` |
| 改行 LF U+000A | `\n` |
| 復帰 CR U+000D | `\r` |
| バックスラッシュ | `\\` |

- 上記 4 種以外の文字は生のまま書く。
- **複数行セル（multiline）の改行は、1 物理行の中に `\n` として書く**。物理的に改行してはいけない。
- セル内にタブを入れたいときは `\t` と書く。
- **空セルは空のまま**（未入力の正本表現）。`—` / `N/A` / `TBD` などで埋めない。

アンエスケープは左から 1 文字ずつ走査し、`\` を見たら次の 1 文字だけをエスケープシーケンスとして消費する（`\\t` を誤ってタブに変換しない）。未知のエスケープ（例 `\x`）や末尾の孤立 `\` はバックスラッシュを literal として温存する。

## 8. バリデーション

各データセルを列型で検査し、違反を行優先順で返す。空セルは未入力＝正本として有効（必須列のときだけ `required` を報告し、それ以外の型検査はしない）。

| コード | 条件 |
|---|---|
| `required` | 必須列（`!`）のセルが空。 |
| `multiline_not_allowed` | `multiline_text` 以外の列に改行またはタブが含まれる。 |
| `enum_value` | enum / radio の値が選択肢に含まれない。 |
| `date_format` | date 列が `YYYY-MM-DD` 形式でない、または実在しない日付（月・日の範囲・閏年を考慮）。 |
| `datetime_format` | datetime 列が `YYYY-MM-DD`（区切りは半角空白または `T`）`HH:MM[:SS]` 形式でない、または実在しない日時。 |
| `number_format` | number 列が `[+-]?(整数 または 小数)` でない（指数表記・カンマ区切りは不可）。 |
| `checkbox_value` | checkbox 列が `TRUE` / `FALSE` / 空 のいずれでもない。 |
| `url_format` | url 列が `http://` または `https://` の URL でない。 |
| `extra_columns` | 行のセル数が列数を超える（最初の余剰セル位置に 1 件報告）。不足は許容。 |

## 9. 保存とラウンドトリップ

シリアライズ（書き戻し）の出力順は固定:

1. `#!` マジック行
2. `#` メタ行
3. `#@` ディレクティブ行
4. 型付きヘッダ行
5. データ行

`parse → serialize → parse` は正規化済みのドキュメントを復元する。留意点:

- **メタ値は trim される**。列名・enum 値には型注記の構造記号（`: ( ) | !`）を含めない前提。
- **列幅合わせの空白パディングなど、手作業の整形は保存で失われる**（セルは値そのものだけを保持する）。
- note / group / レイアウト行は、書き戻し時に他ディレクティブの後（末尾側）へまとめ直される場合がある。値は保持されるが物理的な行位置は正規化される。
- `text` 列は型注記なしで出力される。
- ファイル末尾に改行は付けない（ファイル書き出し層が付与する想定）。

## 10. 運用上の制約

- **グリッド編集中は PDF 出力が無効**。PDF は文書プレビューが表示されている間だけ有効で、検証グリッド表示中や Git 差分表示中は対象外になる。TSV 検証シートを PDF にしたい場合は、別途プレビュー経路（Markdown 版の検証シートなど）を用意する必要がある。
- グリッドは全画面切り替えでエディター分割を畳んで記入に集中でき、`Esc` で分割表示へ戻る。

## データセル運用

未入力 / 未確定 / 未実施のセルは **空のまま** にする。`—` / `–` / `―` / `N/A` / `TBD` などの代替記号は使わない。詳細は [`docs/data-cell-conventions.md`](../data-cell-conventions.md)。

## 参照

- [`test-spec-v1.md`](./test-spec-v1.md) — 姉妹仕様（Markdown + frontmatter 版の検証シート）
- [`spec-v1.md`](./spec-v1.md) — 姉妹仕様（基本設計書）
- [`invoice-v1.md`](./invoice-v1.md) — 姉妹仕様（適格請求書）
- [`packages/schema-test-spec-tsv/README.md`](../../packages/schema-test-spec-tsv/README.md) — パッケージ概要
