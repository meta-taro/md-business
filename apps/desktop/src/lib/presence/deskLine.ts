/**
 * 割符の机の線（1 行 1 JSON）と居場所を相互に変換する（DOM 非依存の純ロジック）。
 *
 * 机は文書も場所も読まずに同じ部屋の相手へ配るだけなので、形の検査はこちらで持つ。
 * 場所は place.ts の JSON 文字列をそのまま運び、空なら「閉じた」。誰の居場所かは机が付ける。
 *
 * 机は知らない欄の付いた行を断り、行と欄を壊す制御文字も受けない。
 * 送れない形のときは切らずに送らない（切ると別の文書・別の場所を指しうる）。
 */

import type { DeskRoom, PresenceUpdate } from './gateway';
import { MAX_NAME_BYTES } from './documentName';
import { decodePlace, encodePlace, type Place } from './place';

/**
 * 机に名乗る 1 行。机は名乗っていない線からの居場所を断るので、繋いだら最初に送る。
 * 名乗りは線ごとなので、繋ぎ直すたびに送り直す。
 */
export const SEAT_LINE = JSON.stringify({ 型: 'listen', 場所: 'md-business' });

/** 相手の居場所を流してもらう 1 行。名乗った直後に送る。 */
export const SUBSCRIBE_LINE = JSON.stringify({ 型: '居場所を聞く' });

/** 自分が入っている部屋の一覧を聞く 1 行。 */
export const ROOMS_LINE = JSON.stringify({ 型: '部屋たち' });

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/;

function fitsDesk(text: string): boolean {
  return new TextEncoder().encode(text).length <= MAX_NAME_BYTES && !CONTROL.test(text);
}

/** 自分の居場所を机の 1 行にする。送れないときは null。 */
export function encodePresenceLine(document: string, place: Place | null, room: string): string | null {
  // 部屋を指さないと、机は画面が見ている部屋へ流してしまう。
  if (document === '' || room === '' || !fitsDesk(document)) return null;
  let wire = '';
  if (place !== null) {
    const encoded = encodePlace(place);
    if (encoded === null || !fitsDesk(encoded)) return null;
    wire = encoded;
  }
  return JSON.stringify({ 型: '居場所', 文書: document, 場所: wire, room });
}

function parseRecord(text: string): Record<string, unknown> | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/** 机から届いた部屋の一覧を読む。一覧でない行は null。形の合わない部屋は飛ばす。 */
export function decodeRoomsLine(text: string): DeskRoom[] | null {
  const record = parseRecord(text);
  if (record === null || record['型'] !== '部屋たち') return null;
  const entries = record['部屋'];
  if (!Array.isArray(entries)) return null;
  const rooms: DeskRoom[] = [];
  for (const entry of entries) {
    if (typeof entry !== 'object' || entry === null) continue;
    const { id, 名前: name, 人数: members } = entry as Record<string, unknown>;
    if (typeof id !== 'string' || id === '' || typeof members !== 'number') continue;
    rooms.push({ id, name: typeof name === 'string' ? name : null, members });
  }
  return rooms;
}

/** 机に断られた理由を読む。断りでない行は null。居場所の行は断られたときだけ返事がある。 */
export function decodeDeniedLine(text: string): string | null {
  const record = parseRecord(text);
  if (record === null || record['型'] !== 'denied') return null;
  const why = record['why'];
  return typeof why === 'string' ? why : null;
}

/** 机から届いた 1 行を相手の居場所として読む。居場所でない行・形の合わない行は null。 */
export function decodeDeskLine(text: string): PresenceUpdate | null {
  const record = parseRecord(text);
  if (record === null || record['型'] !== '居場所') return null;
  const who = record['誰'];
  const document = record['文書'];
  const wire = record['場所'];
  const room = record['room'];
  if (typeof who !== 'string' || who === '') return null;
  if (typeof document !== 'string' || document === '') return null;
  if (typeof wire !== 'string') return null;
  // 部屋の無い居場所は同じ機械の中のもの。画面が見ている部屋とは突き合わせられない。
  if (typeof room !== 'string' || room === '') return null;
  if (wire === '') return { who, document, place: null, room };
  const place = decodePlace(wire);
  return place === null ? null : { who, document, place, room };
}
