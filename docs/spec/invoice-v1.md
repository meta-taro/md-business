# Invoice Schema v1 — 適格請求書

`schemaVersion: invoice/v1` で識別される、日本のインボイス制度（適格請求書等保存方式・2023-10-01 施行）対応スキーマ仕様。

- JSON Schema: [`packages/schema-invoice/src/invoice.schema.json`](../../packages/schema-invoice/src/invoice.schema.json)
- TypeScript 型: [`packages/schema-invoice/src/types.ts`](../../packages/schema-invoice/src/types.ts)
- サンプル: [`templates/invoice/standard.md`](../../templates/invoice/standard.md) / [`templates/invoice/inbound-eligible.md`](../../templates/invoice/inbound-eligible.md)

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
| `invoiceNumber` | ✅ | string | 請求書番号（発行者定義の識別子） |
| `issueDate` | ✅ | string (date) | 取引年月日／発行日 |
| `dueDate` | | string (date) | 支払期限 |
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
