# @md-business/schema-invoice

JSON Schema for Japanese qualified invoices (適格請求書) — conforms to the 2023-10-01 invoice regulation (適格請求書等保存方式).

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

## Spec reference

[`docs/spec/invoice-v1.md`](../../docs/spec/invoice-v1.md)
