import {
  invoiceSchema,
  normalizeInvoiceFrontmatter,
  autofillInvoice,
  renderInvoiceFileName,
  translateInvoiceErrors,
  translateInvoiceWarnings,
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
    const warnings = translateInvoiceWarnings([
      ...normalized.warnings,
      ...autofilled.warnings,
    ]);
    const validation = validateWithCompiled<Invoice>(autofilled.data, validateInvoice);
    if (!validation.ok) {
      // Translate raw Ajv errors to Japanese user-facing messages so the
      // viewer can surface them as a readable alert list.
      const translated = translateInvoiceErrors(validation.errors);
      return {
        ok: false,
        errors: validation.errors.map((e, i) => ({ ...e, message: translated[i] ?? e.message })),
        warnings,
      };
    }
    return { ok: true, data: validation.data, warnings };
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
