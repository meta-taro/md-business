/**
 * 時刻の読み取りと、時間帯の切り出し。
 * -----------------------------------------------------------------------------
 * 調査の結論は時系列に乗って出るので、時刻を勘で読むと結論が静かに狂う。ここでの決めごと。
 *
 * 1. **読める形だけ読む**。読めなければ「読めない」と返し、呼び出し側で「時刻不明」として残す
 * 2. **時差の無い表記は UTC として扱う**。実行機のタイムゾーンで解釈すると、同じログを
 *    別の機械で読んだときに結果が変わる
 * 3. **数値は単位を指定されたときだけ読む**。桁数から秒かミリ秒かを当てると、
 *    1970 年や 58000 年へ静かに飛ぶ
 */

/** 数値の時刻の単位。指定が無ければ数値は時刻として読まない。 */
export type EpochUnit = 'seconds' | 'milliseconds';

/** 時間帯を切る単位。 */
export type BucketUnit = 'day' | 'hour' | 'minute' | 'second';

export interface ParseTimestampOptions {
  /** 数値を時刻として読むときの単位。 */
  epoch?: EpochUnit;
}

export interface Timestamp {
  /** UTC のミリ秒。 */
  ms: number;
  /** 正規化した表記（表示と並べ替えを揃えるため）。 */
  text: string;
}

/**
 * 日付・日時の表記。時差は `Z` / `+09:00` / `+0900` を受ける。
 * 時差が無ければ UTC とみなす（上記 2 の理由）。
 */
const DATE_TIME =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?)?(Z|z|[+-]\d{2}:?\d{2})?$/;

/** 数字だけの文字列（単位の指定があるときだけ時刻として読む）。 */
const DIGITS = /^-?\d+$/;

/** `+09:00` / `-0530` / `Z` を分に直す。 */
function offsetMinutes(zone: string | undefined): number {
  if (zone === undefined || zone === 'Z' || zone === 'z') return 0;
  const sign = zone.startsWith('-') ? -1 : 1;
  const digits = zone.slice(1).replace(':', '');
  const hours = Number(digits.slice(0, 2));
  const minutes = Number(digits.slice(2, 4));
  return sign * (hours * 60 + minutes);
}

/** 小数秒を切り上げずミリ秒 3 桁に揃える。 */
function milliseconds(fraction: string | undefined): number {
  if (fraction === undefined) return 0;
  return Number(fraction.slice(0, 3).padEnd(3, '0'));
}

function fromDateTime(text: string): number | undefined {
  const match = DATE_TIME.exec(text);
  if (match === null) return undefined;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = match[4] === undefined ? 0 : Number(match[4]);
  const minute = match[5] === undefined ? 0 : Number(match[5]);
  const second = match[6] === undefined ? 0 : Number(match[6]);

  if (month < 1 || month > 12) return undefined;
  if (day < 1 || day > 31) return undefined;
  if (hour > 23 || minute > 59 || second > 59) return undefined;

  const ms = Date.UTC(year, month - 1, day, hour, minute, second, milliseconds(match[7]));
  // 2 月 30 日のような「桁は正しいが存在しない日」は、繰り上がって別の日になる。
  // 組み立て直した日付と突き合わせて弾く。
  const built = new Date(ms);
  if (built.getUTCMonth() !== month - 1 || built.getUTCDate() !== day) return undefined;

  return ms - offsetMinutes(match[8]) * 60_000;
}

/**
 * 値を時刻として読む。読めなければ undefined を返す（勘で埋めない）。
 */
export function parseTimestamp(value: unknown, options?: ParseTimestampOptions): Timestamp | undefined {
  const epoch = options?.epoch;

  let ms: number | undefined;
  if (typeof value === 'number') {
    if (epoch === undefined || !Number.isFinite(value)) return undefined;
    ms = epoch === 'seconds' ? value * 1000 : value;
  } else if (typeof value === 'string') {
    const text = value.trim();
    if (text === '') return undefined;
    ms = fromDateTime(text);
    if (ms === undefined && epoch !== undefined && DIGITS.test(text)) {
      const numeric = Number(text);
      if (Number.isFinite(numeric)) ms = epoch === 'seconds' ? numeric * 1000 : numeric;
    }
  }

  if (ms === undefined || !Number.isFinite(ms)) return undefined;
  const rounded = Math.round(ms);
  // Date が扱える範囲を超えると toISOString が例外を投げるので、その手前で読めない扱いにする。
  if (Math.abs(rounded) > 8.64e15) return undefined;
  return { ms: rounded, text: new Date(rounded).toISOString() };
}

/**
 * 時間帯のラベル。UTC で切り、辞書順が時刻順と一致する形にする（並べ替えにそのまま使える）。
 */
export function bucketLabel(ms: number, unit: BucketUnit): string {
  const iso = new Date(ms).toISOString();
  switch (unit) {
    case 'day':
      return iso.slice(0, 10);
    case 'hour':
      return iso.slice(0, 13);
    case 'minute':
      return iso.slice(0, 16);
    case 'second':
      return iso.slice(0, 19);
  }
}
