/**
 * 自分の居場所を送る係。動いたら即送り、同じ場所の繰り返しは送らない。
 *
 * 15 秒ごとに今の場所を送り直す。落ちた相手は「閉じた」を送れないので、受け手は
 * 届かなくなったことで気づくしかない（peers.ts の 45 秒・2 分）。
 * 別の文書へ移るときと、やめるときは、前の文書を「閉じた」にしてから離れる。
 *
 * 運び役は 1 秒に数回までしか受けないので、矢印キーを押しっぱなしにしたような連打は
 * 間を空けて送り、溜めた分は最後の場所だけを送る。途中の場所は相手に要らない。
 */

import type { PresenceGateway } from './gateway';
import { encodePlace, type Place } from './place';

export const RESEND_INTERVAL_MS = 15_000;
/** 同じ文書の中での動きを送る最短の間隔（1 秒に 4 回まで）。 */
export const MIN_SEND_INTERVAL_MS = 250;

export interface PresenceSender {
  /** 今いる場所を伝える。place が null なら、その文書を閉じた。 */
  move(document: string, place: Place | null): void;
  dispose(): void;
}

export function createPresenceSender(gateway: PresenceGateway, room: string): PresenceSender {
  let current: { document: string; place: Place; wire: string } | null = null;
  let lastSentAt = Number.NEGATIVE_INFINITY;
  let held: ReturnType<typeof setTimeout> | null = null;

  function sendCurrent(): void {
    if (!current) return;
    gateway.send(current.document, current.place, room);
    lastSentAt = Date.now();
  }

  function cancelHeld(): void {
    if (held === null) return;
    clearTimeout(held);
    held = null;
  }

  const timer = setInterval(sendCurrent, RESEND_INTERVAL_MS);

  function close(): void {
    cancelHeld();
    if (!current) return;
    gateway.send(current.document, null, room);
    current = null;
  }

  return {
    move(document, place) {
      if (current && current.document !== document) close();
      if (place === null) {
        if (current?.document === document) close();
        return;
      }
      // 上限を超える場所は送れない。古い場所を出し続けるより、閉じて消えるほうが誤解が少ない。
      const wire = encodePlace(place);
      if (wire === null) {
        close();
        return;
      }
      if (current?.wire === wire) return;
      const sameDocument = current?.document === document;
      current = { document, place, wire };
      if (held !== null) return;
      const wait = lastSentAt + MIN_SEND_INTERVAL_MS - Date.now();
      // 文書を移った直後の最初の場所は待たせない（閉じたと開いたが同時に届くほうが分かりやすい）。
      if (!sameDocument || wait <= 0) {
        sendCurrent();
        return;
      }
      held = setTimeout(() => {
        held = null;
        sendCurrent();
      }, wait);
    },
    dispose() {
      clearInterval(timer);
      close();
    },
  };
}
