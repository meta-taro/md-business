# @md-business/core

md-business シリーズの中核。Markdown ファイル（frontmatter + 本文）をパースし、JSON Schema で検証する最小ユーティリティ。

## API

```ts
import { parseMarkdown, validateWith, parseAndValidate } from '@md-business/core';

// 1) frontmatter と本文を分離
const { data, body, ast } = parseMarkdown(src);

// 2) frontmatter を JSON Schema で検証（型付き）
const result = validateWith<MyType>(data, schema);
if (result.ok) {
  result.data; // MyType
} else {
  result.errors; // ValidationError[]
}

// 3) パース + 検証を一発で
const r = parseAndValidate<Invoice>(src, invoiceSchema);
if (r.ok) {
  r.frontmatter; // Invoice
  r.body; // string
  r.ast; // mdast Root
}
```

## 依存

- `gray-matter` — frontmatter パース
- `ajv` + `ajv-formats` — JSON Schema 検証
- `unified` + `remark-parse` — Markdown AST

## ライセンス

MIT
