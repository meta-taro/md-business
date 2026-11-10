/**
 * 画面 1 枚ぶんの居場所のまとまり。出入口の付け替え・自分の居場所を送る係・相手の表を 1 つに束ねる。
 *
 * 出入口は線が繋がるたびに作り直されて渡され、切れたら null が来る（deskBridge.ts）。
 * 切れている間の動きは最後の場所だけ覚えておき、繋がった時点で送る（相手は今の場所しか要らない）。
 * 切れたら相手の印は消す。線が無い間に相手が動いても知りようがないので、古い印を残すと嘘になる。
 *
 * 部屋は呼び出し側が決めて渡す。どの部屋を見せるかは画面の選択であって、ここでは決めない。
 */

import type { PresenceGateway } from './gateway';
import { applyUpdate, prunePeers, visiblePeers, type PeerTable, type PeerView, type VisiblePeer } from './peers';
import type { Place } from './place';
import { createPresenceSender, type PresenceSender } from './sender';

/** 薄くなる・消えるを画面へ知らせるために表を見直す間隔。 */
export const REVIEW_INTERVAL_MS = 5_000;

export interface PresenceSession {
  /** 線の出入口を付け替える。null は切れた。 */
  setGateway(gateway: PresenceGateway | null): void;
  /** 今いる場所を伝える。place が null なら、その文書を閉じた。 */
  move(document: string, place: Place | null): void;
  /** 今の文書・部屋にいる相手。 */
  peers(view: PeerView): VisiblePeer[];
  /** 相手の表が変わったら呼ぶ。戻り値でやめる。 */
  onChange(listener: () => void): () => void;
  dispose(): void;
}

export function createPresenceSession(room: string, now: () => number = Date.now): PresenceSession {
  let table: PeerTable = new Map();
  let last: { document: string; place: Place } | null = null;
  let sender: PresenceSender | null = null;
  let unsubscribe: (() => void) | null = null;
  const listeners = new Set<() => void>();

  function notify(): void {
    for (const listener of listeners) listener();
  }

  function detach(): void {
    unsubscribe?.();
    unsubscribe = null;
    sender?.dispose();
    sender = null;
  }

  const timer = setInterval(() => {
    // 消える相手が出たときだけでなく、薄くなる境目も画面は描き直す必要があるので毎回知らせる。
    if (table.size === 0) return;
    table = prunePeers(table, now());
    notify();
  }, REVIEW_INTERVAL_MS);

  return {
    setGateway(gateway) {
      detach();
      if (table.size > 0) {
        table = new Map();
        notify();
      }
      if (gateway === null) return;
      sender = createPresenceSender(gateway, room);
      if (last) sender.move(last.document, last.place);
      unsubscribe = gateway.subscribe((update) => {
        table = applyUpdate(table, update, now());
        notify();
      });
    },
    move(document, place) {
      if (place === null) {
        if (last?.document === document) last = null;
      } else {
        last = { document, place };
      }
      sender?.move(document, place);
    },
    peers(view) {
      return visiblePeers(table, view, now());
    },
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      clearInterval(timer);
      listeners.clear();
      detach();
      table = new Map();
    },
  };
}
