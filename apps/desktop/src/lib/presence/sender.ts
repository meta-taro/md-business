/**
 * 自分の居場所を送る係。動いたら即送り、同じ場所の繰り返しは送らない。
 *
 * 15 秒ごとに今の場所を送り直す。落ちた相手は「閉じた」を送れないので、受け手は
 * 届かなくなったことで気づくしかない（peers.ts の 45 秒・2 分）。
 * 別の文書へ移るときと、やめるときは、前の文書を「閉じた」にしてから離れる。
 */

import type { PresenceGateway } from './gateway';
import { encodePlace, type Place } from './place';

export const RESEND_INTERVAL_MS = 15_000;

export interface PresenceSender {
  /** 今いる場所を伝える。place が null なら、その文書を閉じた。 */
  move(document: string, place: Place | null): void;
  dispose(): void;
}

export function createPresenceSender(gateway: PresenceGateway, room: string): PresenceSender {
  let current: { document: string; place: Place; wire: string } | null = null;

  const timer = setInterval(() => {
    if (current) gateway.send(current.document, current.place, room);
  }, RESEND_INTERVAL_MS);

  function close(): void {
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
      current = { document, place, wire };
      gateway.send(document, place, room);
    },
    dispose() {
      clearInterval(timer);
      close();
    },
  };
}
