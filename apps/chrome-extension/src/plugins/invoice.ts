import { invoiceSchema, type Invoice } from '@md-business/schema-invoice';
import validateInvoice from '@md-business/schema-invoice/validate';
import { validateWithCompiled } from '@md-business/core';
import { renderInvoiceBody } from '@md-business/renderer-pdf';
import type { SchemaPlugin } from './types.js';

export const invoicePlugin: SchemaPlugin<Invoice> = {
  id: 'invoice',
  label: '請求書（適格請求書）',
  schema: invoiceSchema,
  stylesHref: 'styles/invoice.css',
  validate(frontmatter) {
    return validateWithCompiled<Invoice>(frontmatter, validateInvoice);
  },
  render(frontmatter) {
    return renderInvoiceBody(frontmatter);
  },
  documentTitle(frontmatter) {
    return `請求書 ${frontmatter.invoiceNumber}`;
  },
};
