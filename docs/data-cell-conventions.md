# データセル運用規約 — 「空セル = データなし」

> md-business が定義する Markdown スキーマ群（`schema: test-spec/v1` / `schema: spec/v1` / `schema: invoice/v1`）における **表データセル・YAML データ値・JSON データの未入力扱い** に関する共通規約です。

## 結論

**「未入力 / 未確定 / 未実施」の状態は、セルを空のままにする** のが唯一の正本表現です。
em-dash (`—`) / en-dash (`–`) / horizontal-bar (`―`) / `N/A` / `n/a` / `TBD` / `tbd` / 単一ハイフン (`-`) などの **代替記号でセルを埋めないでください**。

| 表現 | 状態 |
|---|---|
| 空セル `|  |` | ✅ 唯一の正本表現 |
| `\| — \|` / `\| – \|` / `\| ― \|` | ❌ 不可（Markdown 表 + YAML データ値 + JSON データ値で同様） |
| `\| N/A \|` / `\| n/a \|` / `\| TBD \|` / `\| tbd \|` | ❌ 不可 |
| `\| - \|`（単一ハイフン） | ❌ 不可（マイナス値との混同回避） |

## なぜ

1. **`schema: test-spec/v1` の日付列は ISO-8601 (`YYYY-MM-DD`) を厳格検証する**。未実施行で 実施日列に `—` を入れると Workspace Add-on の `validateDateCell` が `invalid_date` で push を中断する
2. **文字列型・複数行型では検証エラーにならないが、「ダッシュという文字列値」と「データなし」を曖昧にする**。後段の集計・フィルタ・ダッシュボード処理で「`—` を含む行は数えるべきか？」の判断が割れる
3. **状態の二重表現を避ける**。検証シートで「未実施」は結果列の enum 値 `"未実施"` のみで表現し、関連列（実施日 / 担当 / 備考）は空セルで統一する

## 適用範囲

- `templates/*/**.md` 配下のテンプレ
- `docs/*/sample.md` 等のサンプル
- 利用者が新規生成する検証シート / 基本設計書 / 適格請求書 の Markdown
- Sheets ⇄ md 双方向同期で書き出された md
- AI エージェント（Claude Code 等）が編集・生成する Markdown 全般

## 検証バリダの動作（v0.7.1 以降）

Workspace Add-on の `validateSheetValues` は **既存ユーザーの過去資産救済** を目的として、入力された `—` / `–` / `―` / `N/A` / `n/a` / `TBD` / `tbd` を **空セル相当として通過させる防御層** を持ちます（`apps/google-workspace-addon/src/lib/testSpecSheetOps.ts`）。

ただしこれは **互換のための寛容処理** であり、推奨ではありません。**新規に書く md / 編集する md では空セルを使ってください**。テンプレ・サンプルが代替記号を含んでいないことは `apps/google-workspace-addon/test/noEmDashInDataCells.test.ts` が回帰防止しています。

## AI エージェント向けの注意

LLM の訓練データには「表の欠損を `—` / `N/A` / `-` で埋める慣習」が多く含まれ、未入力セルを装飾的に埋める癖が出やすい傾向があります。本リポを編集する際は **データ意味より見た目の整列を優先しない** ことを徹底してください。

- Markdown 表生成時：未入力セルは空のまま (`|  |  |` 形式)
- YAML/JSON データ生成時：任意フィールドは省略するか空文字。`"—"` / `"N/A"` 等の文字列で代用しない
- 「セルが空だと入力忘れに見えるかも」と先回りして明示マーカーを置かないこと

## 散文中の em-dash

本規約は **データセル / データ値のみ** を対象とします。散文（解説文・段落本文）中の em-dash（書き言葉としての `—`）は通常の英文・日本語タイポグラフィに従って自由に使えます。

例：
- ✅ 「これは説明文 — つまり em-dash を含む段落」
- ❌ `| 山田 | — |`（表セル中）

## 関連

- JSON Schema 定義: `packages/schema-test-spec/src/test-spec.schema.json` / `packages/schema-spec/` / `packages/schema-invoice/`
- 検証実装: `apps/google-workspace-addon/src/lib/testSpecSheetOps.ts` の `validateCell`
- 回帰防止テスト: `apps/google-workspace-addon/test/noEmDashInDataCells.test.ts`
- 経緯 Issue: [meta-taro/md-business#50](https://github.com/meta-taro/md-business/issues/50)
