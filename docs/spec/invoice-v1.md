# Invoice Schema v1 — 請求書 / 見積書 / 領収書

`schemaVersion: invoice/v1` で識別される、日本のインボイス制度（適格請求書等保存方式・2023-10-01 施行）対応スキーマ仕様。
請求書・見積書・領収書の 3 文書を 1 スキーマで扱い、`documentType`（和名 `種別`）で切り替える。

- JSON Schema: [`packages/schema-invoice/src/invoice.schema.json`](../../packages/schema-invoice/src/invoice.schema.json)
- TypeScript 型: [`packages/schema-invoice/src/types.ts`](../../packages/schema-invoice/src/types.ts)
- サンプル: [`templates/invoice/standard.md`](../../templates/invoice/standard.md) / [`templates/invoice/inbound-eligible.md`](../../templates/invoice/inbound-eligible.md) / [`templates/invoice/quote-ja.md`](../../templates/invoice/quote-ja.md) / [`templates/invoice/receipt-ja.md`](../../templates/invoice/receipt-ja.md)

## 文書種別（`documentType` / `種別`）

省略時は請求書。3 文書は発行元・宛先・品目・税率別小計・合計・印影・テーマ・ロゴ・ファイル名がすべて同じで、
違うのは表題といくつかのラベル、それに領収書固有の 但し書き / 収入印紙欄だけ。
スキーマを分けると税計算・和英辞書・エラー和訳・PDF テンプレを 3 重に持つことになるため、1 スキーマにまとめている。

| `種別` | 表題 | 番号の見出し | 日付の見出し | `dueDate` の見出し | 宛先の見出し | 合計の見出し |
|---|---|---|---|---|---|---|
| （省略） / `請求書` | 請求書 | 請求書番号 | 発行日 | 支払期限 | 請求先 | ご請求金額（税込） |
| `見積書` | 見積書 | 見積書番号 | 発行日 | 有効期限 | 宛先 | お見積金額（税込） |
| `領収書` | 領収書 | 領収書番号 | 領収日 | 支払期限 | 宛先 | 領収金額（税込） |

- 番号は種別によらず `invoiceNumber` に書く。和名は `請求書番号` / `見積書番号` / `領収書番号` のどれでも受ける。宛先も同じく `請求先` / `宛先` のどちらでも受ける。
- ひな形はその種別の見出しに合わせた和名で書いてある（見積書なら `見積書番号:` / `宛先:`）。既存の文書を書き換える必要はない。どの和名も受け続ける。
- ファイル名テンプレートのトークンも和名を揃えてある（`{請求書番号}` / `{見積書番号}` / `{領収書番号}` / `{文書番号}`、`{請求先}` / `{宛先}`）。どれも同じ値を差す。
- 免税事業者の経過措置注記は請求書・領収書にのみ出る。見積書は仕入税額控除の証憑にならないため出さない。
- `subject`（`但し書き`）と `revenueStamp`（`収入印紙`）は領収書でのみ描画する。他の種別に書いても無視する。
- 収入印紙欄は既定で出さない。電子交付の領収書に印紙税はかからないため、紙で手交するときだけ `収入印紙: true` を書く。
- ファイル名テンプレート未指定時の既定接頭辞も種別に追随する（`請求書_` / `見積書_` / `領収書_`）。

## 適格請求書 7 必須項目 → スキーマフィールド対応

| # | 法令記載事項 | スキーマフィールド |
|---|---|---|
| 1 | 適格請求書発行事業者の氏名又は名称 | `issuer.name` |
| 2 | 登録番号 | `issuer.registrationNumber`（`T` + 13 桁、`^T\d{13}$`） |
| 3 | 取引年月日 | `issueDate`（ISO 8601 `YYYY-MM-DD`） |
| 4 | 取引内容（軽減税率対象品目の旨） | `items[].name` + `items[].isReducedRate` |
| 5 | 税率ごとに区分して合計した対価の額（税抜）・適用税率 | `taxSummary.{standard\|reduced\|exempt}.{subtotal,rate}` |
| 6 | 税率ごとに区分した消費税額等 | `taxSummary.{standard\|reduced\|exempt}.tax` |
| 7 | 書類の交付を受ける事業者の氏名又は名称 | `recipient.name` |

## トップレベルフィールド

| フィールド | 必須 | 型 | 説明 |
|---|---|---|---|
| `schemaVersion` | ✅ | `"invoice/v1"` | スキーマバージョン識別子 |
| `documentType` | | `"請求書" \| "見積書" \| "領収書"` | 文書種別（省略時は請求書） |
| `invoiceNumber` | ✅ | string | 文書番号（発行者定義の識別子） |
| `issueDate` | ✅ | string (date) | 取引年月日／発行日（領収書は領収日） |
| `dueDate` | | string (date) | 支払期限（見積書は有効期限） |
| `subject` | | string | 但し書き（領収書のみ。「但し ◯◯として」と刷る） |
| `revenueStamp` | | boolean | 収入印紙欄を出すか（領収書のみ・既定 false） |
| `issuer` | ✅ | object | 発行者情報 |
| `recipient` | ✅ | object | 受領者情報 |
| `items` | ✅ | array (minItems: 1) | 明細 |
| `taxSummary` | ✅ | object | 税率別小計 |
| `totals` | ✅ | object | 合計 |
| `paymentInfo` | | object | 振込先 |
| `notes` | | string | 備考 |

## 税率 enum

`taxRate` および `taxSummary.*.rate` は `0 | 8 | 10` のみ許容（軽減税率 8%、標準税率 10%、非課税 0%）。

将来的に税制改正で税率が追加された場合は `invoice/v2` を新設して対応する。

## 振込先 `accountType`

`普通` / `当座` / `貯蓄` のみ許容。

## YAML frontmatter での注意

- 日付は YYYY-MM-DD 形式の **文字列** として扱う。クォートしないと YAML パーサが `Date` オブジェクト化するため、サンプルでは `"2026-06-30"` のように二重引用符で囲む
- 口座番号は数字のみでも先頭ゼロ保持のため文字列で記述（例: `"1234567"`）

## データセル運用

明細表・備考欄等で未入力セルを **空のまま** にしてください。`—` / `–` / `―` / `N/A` / `TBD` 等の代替記号は使いません。詳細: [`docs/data-cell-conventions.md`](../data-cell-conventions.md)。

## バリデーション例

```ts
import { parseAndValidate } from '@md-business/core';
import { invoiceSchema, type Invoice } from '@md-business/schema-invoice';

const result = parseAndValidate<Invoice>(markdownSrc, invoiceSchema);
if (!result.ok) {
  for (const err of result.errors) {
    console.error(`${err.path}: ${err.message}`);
  }
}
```

## 参照

- 国税庁「適格請求書等保存方式（インボイス制度）の概要」
- `mkpoli/typst-inboisu`（参照源・単一税率実装。本スキーマは複数税率対応で拡張）
