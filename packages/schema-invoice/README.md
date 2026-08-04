# @md-business/schema-invoice

JSON Schema for Japanese qualified invoices (適格請求書) — conforms to the 2023-10-01 invoice regulation (適格請求書等保存方式).

Quotations (見積書) and receipts (領収書) share this schema: set `documentType` (`種別`) and the titles,
field labels and default file name follow. The three document types differ only in wording plus the
receipt-only 但し書き / 収入印紙欄, so keeping them in one schema keeps the tax math, the Japanese key
dictionary and the PDF template single-sourced.

## Document types

| `documentType` | Title | Number label | Date label | `dueDate` label |
| --- | --- | --- | --- | --- |
| (omitted) / `請求書` | 請求書 | 請求書番号 | 発行日 | 支払期限 |
| `見積書` | 見積書 | 見積書番号 | 発行日 | 有効期限 |
| `領収書` | 領収書 | 領収書番号 | 領収日 | 支払期限 |

`subject` (但し書き) and `revenueStamp` (収入印紙) render on receipts only. The stamp box is off by
default — electronically delivered receipts are not subject to stamp duty.

## Coverage

The 7 mandatory items required by the regulation:

1. **適格請求書発行事業者の氏名又は名称** → `issuer.name`
2. **登録番号（T + 13 桁）** → `issuer.registrationNumber`
3. **取引年月日** → `issueDate`
4. **取引内容（軽減税率対象品目である旨）** → `items[].name` + `items[].isReducedRate`
5. **税率ごとに区分して合計した対価の額・適用税率** → `taxSummary.{standard|reduced|exempt}.subtotal` + `.rate`
6. **税率ごとに区分した消費税額等** → `taxSummary.{standard|reduced|exempt}.tax`
7. **書類の交付を受ける事業者の氏名又は名称** → `recipient.name`

## Usage

```ts
import { parseAndValidate } from '@md-business/core';
import { invoiceSchema, type Invoice } from '@md-business/schema-invoice';

const result = parseAndValidate<Invoice>(markdownSource, invoiceSchema);
if (result.ok) {
  const invoice: Invoice = result.frontmatter;
  // render invoice ...
}
```

## Sample templates

- [`templates/invoice/standard.md`](../../templates/invoice/standard.md) — single rate (10%)
- [`templates/invoice/inbound-eligible.md`](../../templates/invoice/inbound-eligible.md) — multi-rate including reduced rate (8%)
- [`templates/invoice/quote-ja.md`](../../templates/invoice/quote-ja.md) — quotation (見積書)
- [`templates/invoice/receipt-ja.md`](../../templates/invoice/receipt-ja.md) — receipt (領収書)

## Spec reference

[`docs/spec/invoice-v1.md`](../../docs/spec/invoice-v1.md)

## Data cell convention

Empty cells are the only canonical representation for unfilled cells in line items and remarks tables. Do **not** fill them with em-dash (`—`), en-dash (`–`), horizontal-bar (`―`), `N/A`, or `TBD`. See [`docs/data-cell-conventions.md`](../../docs/data-cell-conventions.md).
