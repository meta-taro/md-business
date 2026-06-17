import type { Spec } from './types.js';

/**
 * Render a PDF save-file name from a template string. Tokens are written in
 * curly braces and refer to spec fields:
 *
 *   {文書番号} {documentNumber}     — documentNumber
 *   {タイトル} {title}              — title
 *   {版} {version}                  — version
 *   {ステータス} {status}           — status
 *   {発行日} {issueDate}            — issueDate (YYYY-MM-DD)
 *   {発行日YMD} {issueYMD}          — issueDate as YYYYMMDD
 *   {YMD}                           — today as YYYYMMDD (local time)
 *   {date} {今日}                   — today as YYYY-MM-DD
 *
 * Falls back to the default rule `基本設計書_{文書番号}_v{版}` when no
 * template is provided.
 *
 * Windows-forbidden characters (/ \ : * ? " < > |) are replaced with `_`
 * after substitution so the resulting name is always safe to save.
 */
export function renderSpecFileName(spec: Spec, template?: string): string {
  const tpl = template?.trim() || '基本設計書_{文書番号}_v{版}';
  const now = todayLocal();
  const tokens: Record<string, string> = {
    '文書番号': spec.documentNumber ?? '',
    'documentNumber': spec.documentNumber ?? '',
    'タイトル': spec.title ?? '',
    'title': spec.title ?? '',
    '版': spec.version ?? '',
    'version': spec.version ?? '',
    'ステータス': spec.status ?? '',
    'status': spec.status ?? '',
    '発行日': spec.issueDate ?? '',
    'issueDate': spec.issueDate ?? '',
    '発行日YMD': stripDashes(spec.issueDate ?? ''),
    'issueYMD': stripDashes(spec.issueDate ?? ''),
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
  // `new Date()` is intentional — same reasoning as schema-invoice/fileName:
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
