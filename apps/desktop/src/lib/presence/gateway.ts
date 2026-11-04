/**
 * 居場所の出入口。運び役（割符の机の線など）をこの形に閉じ、画面側は中身を知らずに使う。
 *
 * 相手が抜けた・落ちたことは別の知らせにしない。抜けたときは運び役が「閉じた」
 * （place が null）を流し、落ちたときは何も来ないので、受け手が古さで消す（peers.ts）。
 */

import type { Place } from './place';

/** 相手から届いた居場所。place が null なら、その文書を閉じた。 */
export interface PresenceUpdate {
  /** 運び役が付ける相手の名前。自分では名乗らない。 */
  who: string;
  document: string;
  place: Place | null;
  room: string;
}

export interface PresenceGateway {
  /** 自分の居場所を送る。null は「閉じた」。room は必ず指す（運び役の既定に頼らない）。 */
  send(document: string, place: Place | null, room: string): void;
  /** 相手の居場所を受け取る。戻り値で受け取りをやめる。 */
  subscribe(listener: (update: PresenceUpdate) => void): () => void;
}
