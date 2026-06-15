import type { Invoice } from '@md-business/schema-invoice';
import { escapeHtml } from './escape.js';
import { renderInvoiceBody, type RenderInvoiceBodyOptions } from './template.js';

export interface RenderInvoiceHtmlOptions extends RenderInvoiceBodyOptions {
  /** Inline <style> contents (CSS string). Mutually exclusive with stylesHref. */
  embedStyles?: string;
  /** External stylesheet href to <link rel="stylesheet">. */
  stylesHref?: string;
  /** Document title (defaults to "請求書 <invoiceNumber>"). */
  documentTitle?: string;
  /** Page language attribute (defaults to "ja"). */
  lang?: string;
}

export function renderInvoiceHtml(invoice: Invoice, options: RenderInvoiceHtmlOptions = {}): string {
  const lang = options.lang ?? 'ja';
  const title = options.documentTitle ?? `請求書 ${invoice.invoiceNumber}`;
  const styleTag = options.embedStyles
    ? `<style>${options.embedStyles}</style>`
    : '';
  const linkTag = options.stylesHref
    ? `<link rel="stylesheet" href="${escapeHtml(options.stylesHref)}">`
    : '';

  return `<!doctype html>
<html lang="${escapeHtml(lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
${linkTag}
${styleTag}
</head>
<body>
${renderInvoiceBody(invoice, options)}
</body>
</html>`;
}
