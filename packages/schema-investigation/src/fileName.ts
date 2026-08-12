import type { Investigation } from './types.js';

/**
 * Render a PDF save-file name from a template string. Tokens are written in
 * curly braces and refer to investigation fields:
 *
 *   {文書番号} {documentNumber}     — documentNumber
 *   {タイトル} {title}              — title
 *   {種別} {kind}                   — kind (log / network)
 *   {状態} {status}                 — status
 *   {作成日} {createdDate}          — createdAt as YYYY-MM-DD
 *   {作成日YMD} {createdYMD}        — createdAt as YYYYMMDD
 *   {YMD}                           — today as YYYYMMDD (local time)
 *   {date} {今日}                   — today as YYYY-MM-DD
 *
 * Falls back to the default rule `調査報告書_{文書番号}` when no template is
 * provided.
 *
 * Windows-forbidden characters (/ \ : * ? " < > |) are replaced with `_`
 * after substitution so the resulting name is always safe to save.
 */
export function renderInvestigationFileName(
  investigation: Investigation,
  template?: string,
): string {
  const tpl = template?.trim() || '調査報告書_{文書番号}';
  const now = todayLocal();
  const createdDate = datePart(investigation.createdAt ?? '');
  const tokens: Record<string, string> = {
    '文書番号': investigation.documentNumber ?? '',
    'documentNumber': investigation.documentNumber ?? '',
    'タイトル': investigation.title ?? '',
    'title': investigation.title ?? '',
    '種別': investigation.kind ?? '',
    'kind': investigation.kind ?? '',
    '状態': investigation.status ?? '',
    'status': investigation.status ?? '',
    '作成日': createdDate,
    'createdDate': createdDate,
    '作成日YMD': stripDashes(createdDate),
    'createdYMD': stripDashes(createdDate),
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

/** `createdAt` is a date-time; the file name only ever wants the date half. */
function datePart(createdAt: string): string {
  return createdAt.slice(0, 10);
}

function stripDashes(iso: string): string {
  return iso.replace(/-/g, '');
}

function todayLocal(): { iso: string; ymd: string } {
  // `new Date()` is intentional — same reasoning as the other document types:
  // runtime browser code, local-time "today" should match the user's calendar.
  const d = new Date();
  const y = d.getFullYear().toString().padStart(4, '0');
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return { iso: `${y}-${m}-${day}`, ymd: `${y}${m}${day}` };
}

const FORBIDDEN = /[\\/:*?"<>|\r\n\t]/g;

function sanitizeFileName(name: string): string {
  return name
    .replace(FORBIDDEN, '_')
    .replace(/\s+/g, ' ')
    .replace(/_+/g, '_')
    .replace(/^[._\s]+|[._\s]+$/g, '')
    .trim();
}
