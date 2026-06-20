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
import type { PreviewRenderResult, SchemaPlugin } from './types.js';

/**
 * Inject the minimum structural defaults needed for `renderInvoiceBody` not
 * to crash on an in-progress draft. Authors editing live should see something
 * useful (an empty 請求先 box, a zero total) instead of a blank preview when
 * required fields are not yet filled in.
 */
function withPreviewDefaults(data: Record<string, unknown>): Invoice {
  const safe: Record<string, unknown> = { ...data };
  if (!safe['schemaVersion']) safe['schemaVersion'] = 'invoice/v1';
  if (!safe['invoiceNumber']) safe['invoiceNumber'] = '';
  if (!safe['issueDate']) safe['issueDate'] = '';
  if (typeof safe['issuer'] !== 'object' || safe['issuer'] === null) {
    safe['issuer'] = { name: '' };
  } else if (!(safe['issuer'] as Record<string, unknown>)['name']) {
    safe['issuer'] = { ...(safe['issuer'] as Record<string, unknown>), name: '' };
  }
  if (typeof safe['recipient'] !== 'object' || safe['recipient'] === null) {
    safe['recipient'] = { name: '' };
  } else if (!(safe['recipient'] as Record<string, unknown>)['name']) {
    safe['recipient'] = { ...(safe['recipient'] as Record<string, unknown>), name: '' };
  }
  if (!Array.isArray(safe['items'])) safe['items'] = [];
  // autofillInvoice always emits taxSummary + totals, so no defaulting needed there.
  return safe as unknown as Invoice;
}

export const invoicePlugin: SchemaPlugin<Invoice> = {
  id: 'invoice',
  label: '請求書（適格 / 免税対応）',
  schema: invoiceSchema,
  stylesHref: 'styles/invoice.css',
  detect(frontmatter) {
    // Marker keys unique to invoice frontmatter — both English and the
    // Japanese aliases that normalize would translate. Any one is enough.
    const markers = ['invoiceNumber', '請求書番号', 'items', '品目', 'issuer', '発行元'];
    return markers.some((k) => k in frontmatter);
  },
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
  previewRender(frontmatter): PreviewRenderResult {
    // Same normalize → autofill pipeline as validate(), but we keep going even
    // when the result fails Ajv — the editor needs SOMETHING in the preview
    // pane while the author is still typing.
    const normalized = normalizeInvoiceFrontmatter(frontmatter);
    const autofilled = autofillInvoice(normalized.data);
    const warnings = translateInvoiceWarnings([
      ...normalized.warnings,
      ...autofilled.warnings,
    ]);
    const validation = validateWithCompiled<Invoice>(autofilled.data, validateInvoice);
    const errors = validation.ok ? [] : validation.errors.map((e, i) => ({
      ...e,
      message: translateInvoiceErrors(validation.errors)[i] ?? e.message,
    }));
    const safe = withPreviewDefaults(autofilled.data);
    try {
      return { html: renderInvoiceBody(safe), warnings, errors };
    } catch (renderErr: unknown) {
      const reason = renderErr instanceof Error ? renderErr.message : String(renderErr);
      return { html: '', warnings, errors, fatal: `プレビューを描画できませんでした: ${reason}` };
    }
  },
  documentTitle(frontmatter) {
    return `請求書 ${frontmatter.invoiceNumber}`;
  },
  pdfFileName(frontmatter) {
    return renderInvoiceFileName(frontmatter, frontmatter.fileName);
  },
};
