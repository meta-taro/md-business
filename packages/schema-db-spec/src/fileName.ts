import type { DbSpec } from './types.js';

/**
 * Render a PDF save-file name from a template string. Tokens are written in
 * curly braces and refer to db-spec fields:
 *
 *   {文書番号} {documentNumber}     — documentNumber
 *   {タイトル} {title}              — title
 *   {版} {version}                  — version
 *   {ステータス} {status}           — status
 *   {エンジン} {engine}             — engine
 *   {発行日} {issueDate}            — issueDate (YYYY-MM-DD)
 *   {発行日YMD} {issueYMD}          — issueDate as YYYYMMDD
 *   {YMD}                           — today as YYYYMMDD (local time)
 *   {date} {今日}                   — today as YYYY-MM-DD
 *
 * Falls back to the default rule `DB設計書_{文書番号}_v{版}` when no
 * template is provided.
 *
 * Windows-forbidden characters (/ \ : * ? " < > |) are replaced with `_`
 * after substitution so the resulting name is always safe to save.
 */
export function renderDbSpecFileName(dbSpec: DbSpec, template?: string): string {
  const tpl = template?.trim() || 'DB設計書_{文書番号}_v{版}';
  const now = todayLocal();
  const tokens: Record<string, string> = {
    '文書番号': dbSpec.documentNumber ?? '',
    'documentNumber': dbSpec.documentNumber ?? '',
    'タイトル': dbSpec.title ?? '',
    'title': dbSpec.title ?? '',
    '版': dbSpec.version ?? '',
    'version': dbSpec.version ?? '',
    'ステータス': dbSpec.status ?? '',
    'status': dbSpec.status ?? '',
    'エンジン': dbSpec.engine ?? '',
    'engine': dbSpec.engine ?? '',
    '発行日': dbSpec.issueDate ?? '',
    'issueDate': dbSpec.issueDate ?? '',
    '発行日YMD': stripDashes(dbSpec.issueDate ?? ''),
    'issueYMD': stripDashes(dbSpec.issueDate ?? ''),
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
