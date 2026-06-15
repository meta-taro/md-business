import { invoiceSchema, type Invoice } from '@md-business/schema-invoice';
import { renderInvoiceBody } from '@md-business/renderer-pdf';
import type { SchemaPlugin } from './types.js';

export const invoicePlugin: SchemaPlugin<Invoice> = {
  id: 'invoice',
  label: '請求書（適格請求書）',
  schema: invoiceSchema,
  stylesHref: 'styles/invoice.css',
  render(frontmatter) {
    return renderInvoiceBody(frontmatter);
  },
  documentTitle(frontmatter) {
    return `請求書 ${frontmatter.invoiceNumber}`;
  },
};
