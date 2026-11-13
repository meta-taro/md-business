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

/** 自分が入っている部屋。名前の無い部屋は画面で番号を付けて見せる。 */
export interface DeskRoom {
  id: string;
  name: string | null;
  members: number;
}

export interface PresenceGateway {
  /** 自分の居場所を送る。null は「閉じた」。room は必ず指す（運び役の既定に頼らない）。 */
  send(document: string, place: Place | null, room: string): void;
  /** 相手の居場所を受け取る。戻り値で受け取りをやめる。 */
  subscribe(listener: (update: PresenceUpdate) => void): () => void;
  /** 部屋の一覧を聞く。答えは onRooms へ届く。 */
  askRooms(): void;
  onRooms(listener: (rooms: DeskRoom[]) => void): () => void;
  /** 運び役に断られた理由を受け取る（入っていない部屋を指した等）。 */
  onDenied(listener: (why: string) => void): () => void;
}
