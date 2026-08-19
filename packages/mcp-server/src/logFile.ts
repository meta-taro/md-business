/**
 * 作業ログのファイル名・行の形・期限の仕分け（純ロジック）。
 * -----------------------------------------------------------------------------
 * **日付で分ける。大きさでは分けない。** 大きさで切ると区切りが日付をまたぐので、
 * 「30 日より古い分を落とす」のにファイルの中を書き換えることになる。日付で分ければ、
 * 消すのも畳むのもファイル 1 個の操作で終わり、探す側もファイル単位で読める。
 */
import type { ToolLogEntry } from './toolLog.js';
import type { OnExpire } from './logConfig.js';

const DAY_FILE = /^(\d{4})-(\d{2})-(\d{2})\.jsonl$/;
const MS_PER_DAY = 86_400_000;

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** その日の日付（手元の時刻）を `YYYY-MM-DD` にする。 */
export function logDay(ts: number): string {
  const at = new Date(ts);
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
}

/** その日のログを書くファイル名。 */
export function logDayName(ts: number): string {
  return `${logDay(ts)}.jsonl`;
}

/** entry を 1 行にする。JSON.stringify は改行を `\n` に畳むので 1 行に収まる。 */
export function encodeLogLine(entry: ToolLogEntry): string {
  return `${JSON.stringify(entry)}\n`;
}

export interface RetentionPlan {
  archive: string[];
  delete: string[];
}

export interface RetentionOptions {
  retentionDays: number;
  onExpire: OnExpire;
}

/** `YYYY-MM-DD` を日数（UTC 基準）に直す。時差を挟まないので引き算が安定する。 */
function toDayNumber(text: string): number | null {
  const matched = DAY_FILE.exec(`${text}.jsonl`);
  if (matched === null) return null;
  return Date.UTC(Number(matched[1]), Number(matched[2]) - 1, Number(matched[3])) / MS_PER_DAY;
}

/**
 * 期限を過ぎたファイルを仕分ける。
 *
 * - **今日の分には触らない**。書いている最中のファイルを畳むと、その日のログが切れる
 * - 日付として読めない名前（人が置いたメモ・`archive` フォルダ）には触らない
 */
export function planRetention(
  names: readonly string[],
  today: string,
  options: RetentionOptions,
): RetentionPlan {
  const plan: RetentionPlan = { archive: [], delete: [] };
  if (options.onExpire === 'keep') return plan;

  const todayNumber = toDayNumber(today);
  if (todayNumber === null) return plan;

  for (const name of names) {
    const matched = DAY_FILE.exec(name);
    if (matched === null) continue;
    const day = toDayNumber(name.slice(0, -'.jsonl'.length));
    if (day === null || day >= todayNumber) continue;
    if (todayNumber - day <= options.retentionDays) continue;
    plan[options.onExpire === 'delete' ? 'delete' : 'archive'].push(name);
  }
  return plan;
}
