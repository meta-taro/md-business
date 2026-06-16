import type { Invoice } from './types.js';

/**
 * Render a PDF save-file name from a template string. Tokens are written in
 * curly braces and refer to invoice fields:
 *
 *   {請求先} {recipient}                 — recipient.name
 *   {敬称}   {honorific}                 — recipient.honorific
 *   {発行元} {issuer}                    — issuer.name
 *   {請求書番号} {番号} {invoiceNumber}   — invoiceNumber
 *   {発行日} {issueDate}                 — issueDate (YYYY-MM-DD)
 *   {発行日YMD} {issueYMD}               — issueDate as YYYYMMDD
 *   {YMD}                                — today as YYYYMMDD (local time)
 *   {date} {今日}                        — today as YYYY-MM-DD
 *
 * Missing values are dropped (e.g. recipient.honorific defaults to '' if
 * absent), so a template like `{請求先}{敬称}_{YMD}` cleanly degrades when
 * the recipient has no honorific.
 *
 * Falls back to the default rule `請求書_{請求書番号}` when no template is
 * provided.
 *
 * Windows-forbidden characters (/ \ : * ? " < > |) are replaced with `_`
 * after substitution so the resulting name is always safe to save.
 */
export function renderInvoiceFileName(invoice: Invoice, template?: string): string {
  const tpl = template?.trim() || '請求書_{請求書番号}';
  const now = todayLocal();
  const tokens: Record<string, string> = {
    '請求先': invoice.recipient.name ?? '',
    'recipient': invoice.recipient.name ?? '',
    '敬称': invoice.recipient.honorific ?? '',
    'honorific': invoice.recipient.honorific ?? '',
    '発行元': invoice.issuer.name ?? '',
    'issuer': invoice.issuer.name ?? '',
    '請求書番号': invoice.invoiceNumber ?? '',
    '番号': invoice.invoiceNumber ?? '',
    'invoiceNumber': invoice.invoiceNumber ?? '',
    '発行日': invoice.issueDate ?? '',
    'issueDate': invoice.issueDate ?? '',
    '発行日YMD': stripDashes(invoice.issueDate ?? ''),
    'issueYMD': stripDashes(invoice.issueDate ?? ''),
    'YMD': now.ymd,
    'date': now.iso,
    '今日': now.iso,
  };
  const rendered = tpl.replace(/\{([^}]+)\}/g, (_, raw: string) => {
    const key = raw.trim();
    return tokens[key] ?? '';
  });
  return sanitizeFileName(rendered);
}

function stripDashes(iso: string): string {
  return iso.replace(/-/g, '');
}

function todayLocal(): { iso: string; ymd: string } {
  // `new Date()` is intentional — the call site is runtime browser code, not
  // a deterministic workflow script. Use local time so the YMD matches the
  // user's calendar perception (a German user's "today" should not flip at
  // 09:00 because the script forced UTC).
  const d = new Date();
  const y = d.getFullYear().toString().padStart(4, '0');
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return { iso: `${y}-${m}-${day}`, ymd: `${y}${m}${day}` };
}

const FORBIDDEN = /[\\/:*?"<>|\r\n\t]/g;

function sanitizeFileName(name: string): string {
  // Strip Windows-forbidden + path-traversal chars; collapse runs of spaces
  // and the resulting underscore noise so consecutive empty tokens don't
  // leave `__` artifacts in the filename.
  return name
    .replace(FORBIDDEN, '_')
    .replace(/\s+/g, ' ')
    .replace(/_+/g, '_')
    .replace(/^[._\s]+|[._\s]+$/g, '')
    .trim();
}
