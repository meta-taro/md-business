/**
 * 居場所の「場所」を、運び役へ渡す JSON 文字列と相互に変換する（DOM 非依存の純ロジック）。
 *
 * - Markdown は行、TSV は行 ID ＋列名で指す。行 ID の無い表は行番号で指し、
 *   `shifts: true` を付けて「相手が行を挿すとずれる」ことを受け手に伝える。
 * - ブランチは文書の名前に入れず、ここに入れる。違うブランチを見ている相手も、
 *   同じ文書を見ていることには変わりないため（受け手が「別のブランチ」と印を付ける）。
 * - 相手から届いた場所は信用しない。形が合わないものは黙って捨てる。
 */

import { MAX_NAME_BYTES } from './documentName';

export interface MarkdownPlace {
  kind: 'markdown';
  branch: string;
  /** 1 始まりの行番号。 */
  line: number;
}

export type TsvPlace =
  | { kind: 'tsv'; branch: string; rowId: string; column: string }
  | { kind: 'tsv'; branch: string; row: number; column: string };

export type Place = MarkdownPlace | TsvPlace;

/** 運び役が受け付ける場所の上限（バイト）。文書の名前と同じ。 */
export const MAX_PLACE_BYTES = MAX_NAME_BYTES;

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

/** 場所を JSON 文字列にする。上限を超えるときは null（送らない）。 */
export function encodePlace(place: Place): string | null {
  let wire: Record<string, unknown>;
  if (place.kind === 'markdown') {
    wire = { branch: place.branch, line: place.line };
  } else if ('rowId' in place) {
    wire = { branch: place.branch, rowId: place.rowId, column: place.column };
  } else {
    wire = { branch: place.branch, row: place.row, column: place.column, shifts: true };
  }
  const text = JSON.stringify(wire);
  return byteLength(text) > MAX_PLACE_BYTES ? null : text;
}

function isIndex(value: unknown, min: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min;
}

/** 届いた場所を読む。空（＝閉じた）や読めないものは null。 */
export function decodePlace(text: string): Place | null {
  if (text === '' || byteLength(text) > MAX_PLACE_BYTES) return null;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const { branch, column } = record;
  if (typeof branch !== 'string') return null;

  if (isIndex(record.line, 1)) return { kind: 'markdown', branch, line: record.line };
  if (typeof column !== 'string') return null;
  if (typeof record.rowId === 'string' && record.rowId !== '') {
    return { kind: 'tsv', branch, rowId: record.rowId, column };
  }
  if (isIndex(record.row, 0)) return { kind: 'tsv', branch, row: record.row, column };
  return null;
}
