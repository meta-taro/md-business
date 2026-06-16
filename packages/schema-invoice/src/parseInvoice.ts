import { splitFrontmatter, validateWithCompiled, type CompiledValidator, type ValidationError } from '@md-business/core';
import { normalizeInvoiceFrontmatter, type NormalizeWarning } from './normalize.js';
import { autofillInvoice, type AutofillWarning } from './autofill.js';
import type { Invoice } from './types.js';

export interface InvoiceParseSuccess {
  ok: true;
  invoice: Invoice;
  body: string;
  warnings: Array<NormalizeWarning | AutofillWarning>;
}

export interface InvoiceParseFailure {
  ok: false;
  errors: ValidationError[];
  warnings: Array<NormalizeWarning | AutofillWarning>;
}

export type InvoiceParseResult = InvoiceParseSuccess | InvoiceParseFailure;

/**
 * End-to-end Markdown → Invoice pipeline:
 *
 *   1. splitFrontmatter — extract YAML block
 *   2. normalizeInvoiceFrontmatter — translate Japanese keys to English
 *   3. autofillInvoice — derive taxSummary/totals from items, default rounding
 *   4. validateWithCompiled — Ajv-compiled schema check
 *
 * Steps 1–3 are pure data transforms; only step 4 is the gating check.
 * Authors get a single function that lets them write a 3-item invoice in
 * Japanese frontmatter with no totals block and have it render correctly.
 *
 * `validate` is injected so this module stays Ajv-runtime-free for MV3 CSP.
 */
export function parseInvoiceMarkdown(
  src: string,
  validate: CompiledValidator,
): InvoiceParseResult {
  const split = splitFrontmatter(src);
  const normalized = normalizeInvoiceFrontmatter(split.data);
  const autofilled = autofillInvoice(normalized.data);
  const warnings = [...normalized.warnings, ...autofilled.warnings];
  const validation = validateWithCompiled<Invoice>(autofilled.data, validate);
  if (!validation.ok) {
    return { ok: false, errors: validation.errors, warnings };
  }
  return { ok: true, invoice: validation.data, body: split.body, warnings };
}

/**
 * Variant for callers that already parsed the frontmatter object (e.g. tests
 * that build literal objects). Performs normalize → autofill → validate.
 */
export function parseInvoiceObject(
  raw: unknown,
  validate: CompiledValidator,
): { ok: true; invoice: Invoice; warnings: Array<NormalizeWarning | AutofillWarning> } | InvoiceParseFailure {
  const normalized = normalizeInvoiceFrontmatter(raw);
  const autofilled = autofillInvoice(normalized.data);
  const warnings = [...normalized.warnings, ...autofilled.warnings];
  const validation = validateWithCompiled<Invoice>(autofilled.data, validate);
  if (!validation.ok) {
    return { ok: false, errors: validation.errors, warnings };
  }
  return { ok: true, invoice: validation.data, warnings };
}
