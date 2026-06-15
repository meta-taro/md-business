# @md-business/renderer-pdf

A4 縦・日本語対応の請求書 HTML/PDF レンダラ。

- **`renderInvoiceBody(invoice)`** — HTML フラグメント（`<article>` のみ）を返す pure 関数
- **`renderInvoiceHtml(invoice, { embedStyles | stylesHref })`** — `<!doctype html>` から始まる完全な HTML 文書
- **`printInvoice(invoice)`** (`./browser`) — ブラウザで印刷ダイアログを開いて PDF として保存

`./styles/invoice.css` を `<link>` で読み込むか、`embedStyles` で文字列として埋め込んでください。PDF 化はブラウザ印刷経由を前提（Paged.js を組み合わせると `@page` ルール・ヘッダ/フッタが厳密に効きます）。

## 使い方（Chrome 拡張からの想定）

```ts
import { parseAndValidate } from '@md-business/core';
import { invoiceSchema, type Invoice } from '@md-business/schema-invoice';
import { renderInvoiceHtml } from '@md-business/renderer-pdf';
import { printInvoice } from '@md-business/renderer-pdf/browser';
import cssUrl from '@md-business/renderer-pdf/styles/invoice.css?url';

const result = parseAndValidate<Invoice>(markdownSrc, invoiceSchema);
if (!result.ok) throw new Error('invalid invoice');

const html = renderInvoiceHtml(result.frontmatter, { stylesHref: cssUrl });
// または DOM へ差し込む:
document.body.innerHTML = renderInvoiceBody(result.frontmatter);
// PDF DL:
printInvoice(result.frontmatter, { stylesHref: cssUrl, inNewWindow: true });
```

## 設計方針

- **HTML 生成は pure** — テスト容易・サーバ/Worker でも使用可
- **PDF 化はブラウザ印刷経由** — Chrome 拡張は Paged.js を別途 inject
- **XSS 対策** — 全フィールドを HTML エスケープ
- **印影なし**（baseline 方針）— 署名欄余白のみ。`signatureArea: false` で完全除去可
