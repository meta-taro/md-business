/**
 * 居場所を割符の机へ渡す荷物（外箱）を組む・読む（DOM 非依存の純ロジック）。
 *
 * 割符は中を見ずに同じ部屋の相手へ配るだけなので、形の検査はすべてこちらで持つ。
 * 運び役が受ける荷物は 1 つ 1 KB まで。名前と場所はそれぞれ 512 バイトまでだが、
 * 両方が上限近いと合わせて 1 KB を超える。そのときは切らずに送らない
 * （切ると別の文書・別の場所を指しうる）。
 */

import { MAX_NAME_BYTES } from './documentName';
import { decodePlace, encodePlace, type Place } from './place';

/** 割符のアプリ用の名前空間 `app.<アプリ名>.<何>`。各節は英小文字と数字だけ。 */
export const PRESENCE_KIND = 'app.mdbusiness.presence';

/** 運び役が受け付ける荷物の上限（バイト）。 */
export const MAX_ENVELOPE_BYTES = 1024;

export interface Envelope {
  document: string;
  /** null なら、その文書を閉じた。 */
  place: Place | null;
}

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

function isDocumentName(value: unknown): value is string {
  return typeof value === 'string' && value !== '' && byteLength(value) <= MAX_NAME_BYTES;
}

/** 荷物を JSON 文字列にする。どれかの上限を超えるときは null（送らない）。 */
export function encodeEnvelope(document: string, place: Place | null): string | null {
  if (!isDocumentName(document)) return null;
  let placeWire = 'null';
  if (place !== null) {
    const encoded = encodePlace(place);
    if (encoded === null) return null;
    placeWire = encoded;
  }
  const text = `{"document":${JSON.stringify(document)},"place":${placeWire}}`;
  return byteLength(text) > MAX_ENVELOPE_BYTES ? null : text;
}

/** 相手から届いた荷物を読む。形が合わないものは null（黙って捨てる）。 */
export function decodeEnvelope(text: string): Envelope | null {
  if (text === '' || byteLength(text) > MAX_ENVELOPE_BYTES) return null;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const { document, place } = value as Record<string, unknown>;
  if (!isDocumentName(document)) return null;
  if (place === null) return { document, place: null };
  if (typeof place !== 'object' || place === undefined || Array.isArray(place)) return null;
  const decoded = decodePlace(JSON.stringify(place));
  return decoded === null ? null : { document, place: decoded };
}
