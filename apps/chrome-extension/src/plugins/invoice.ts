import {
  invoiceSchema,
  normalizeInvoiceFrontmatter,
  autofillInvoice,
  renderInvoiceFileName,
  type Invoice,
} from '@md-business/schema-invoice';
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
    // Two transforms run before validation so authors can write a minimal
    // Japanese-keyed frontmatter and have the canonical English shape
    // emerge: normalize (key translation) -> autofill (compute totals).
    const normalized = normalizeInvoiceFrontmatter(frontmatter);
    const autofilled = autofillInvoice(normalized.data);
    return validateWithCompiled<Invoice>(autofilled.data, validateInvoice);
  },
  render(frontmatter) {
    return renderInvoiceBody(frontmatter);
  },
  documentTitle(frontmatter) {
    return `請求書 ${frontmatter.invoiceNumber}`;
  },
  pdfFileName(frontmatter) {
    return renderInvoiceFileName(frontmatter, frontmatter.fileName);
  },
};
