/**
 * テストと画面の試作に使う、同じプロセスの中だけで居場所を配る偽の出入口。
 * 運び役と同じく、送った本人には返さず、名前（who）は配る側が付ける。
 */

import type { PresenceGateway, PresenceUpdate } from './gateway';

export interface FakeHub {
  /** この名前で部屋に入った出入口を作る。 */
  join(who: string): PresenceGateway;
}

export function createFakeHub(): FakeHub {
  const members = new Map<string, Set<(update: PresenceUpdate) => void>>();

  return {
    join(who) {
      const listeners = new Set<(update: PresenceUpdate) => void>();
      members.set(who, listeners);
      return {
        send(document, place, room) {
          for (const [other, others] of members) {
            if (other === who) continue;
            for (const listener of others) listener({ who, document, place, room });
          }
        },
        subscribe(listener) {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      };
    },
  };
}
