import type { TestSpec } from './types.js';

/**
 * Render a PDF save-file name from a template string. Tokens are written in
 * curly braces and refer to test-spec fields:
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
 * Falls back to the default rule `検証シート_{文書番号}_v{版}` when no
 * template is provided.
 *
 * Windows-forbidden characters (/ \ : * ? " < > |) are replaced with `_`
 * after substitution so the resulting name is always safe to save.
 */
export function renderTestSpecFileName(testSpec: TestSpec, template?: string): string {
  const tpl = template?.trim() || '検証シート_{文書番号}_v{版}';
  const now = todayLocal();
  const tokens: Record<string, string> = {
    '文書番号': testSpec.documentNumber ?? '',
    'documentNumber': testSpec.documentNumber ?? '',
    'タイトル': testSpec.title ?? '',
    'title': testSpec.title ?? '',
    '版': testSpec.version ?? '',
    'version': testSpec.version ?? '',
    'ステータス': testSpec.status ?? '',
    'status': testSpec.status ?? '',
    '発行日': testSpec.issueDate ?? '',
    'issueDate': testSpec.issueDate ?? '',
    '発行日YMD': stripDashes(testSpec.issueDate ?? ''),
    'issueYMD': stripDashes(testSpec.issueDate ?? ''),
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
  // `new Date()` is intentional — same reasoning as schema-spec/fileName:
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
