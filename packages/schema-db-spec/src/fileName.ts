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
 * Windows-forbidden characters (/ \ : * ? " < > |), NUL and C0/DEL control
 * characters are replaced with `_` after substitution; Windows reserved device
 * names (CON, PRN, AUX, NUL, COM1-9, LPT1-9) are prefixed with `_`; and an
 * empty result falls back to `untitled` — so the resulting name is always
 * safe to save.
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
    // hasOwnProperty guard: a `{__proto__}` token must resolve to the empty
    // string, not to the inherited `Object.prototype` accessor value.
    return Object.prototype.hasOwnProperty.call(tokens, key) ? tokens[key] ?? '' : '';
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

// Windows-forbidden characters plus NUL / C0 control chars (\x00-\x1f) and DEL
// (\x7f). An embedded NUL in particular can truncate a filename at the OS layer,
// so it must never survive into a name the caller treats as "safe to save".
const FORBIDDEN = /[\x00-\x1f\x7f\\/:*?"<>|]/g;

// Windows reserved device names (case-insensitive, matched on the stem before
// any extension). Saving a file literally named e.g. `CON` fails on Windows.
const RESERVED_DEVICE_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

function sanitizeFileName(name: string): string {
  const stripped = name
    .replace(FORBIDDEN, '_')
    .replace(/\s+/g, ' ')
    .replace(/_+/g, '_')
    .replace(/^[._\s]+|[._\s]+$/g, '')
    .trim();
  if (stripped.length === 0) return 'untitled';
  const stem = stripped.split('.')[0] ?? stripped;
  return RESERVED_DEVICE_NAME.test(stem) ? `_${stripped}` : stripped;
}
