/**
 * テストと画面の試作に使う、同じプロセスの中だけで居場所を配る偽の出入口。
 * 運び役と同じく、送った本人には返さず、名前（who）は配る側が付ける。
 */

import type { DeskRoom, PresenceGateway, PresenceUpdate } from './gateway';

export interface FakeHub {
  /** この名前で部屋に入った出入口を作る。 */
  join(who: string): PresenceGateway;
  /** 部屋の一覧を差し替え、聞いている全員へ配る。 */
  setRooms(rooms: DeskRoom[]): void;
  /** この名前の出入口へ「断った」を届ける。 */
  deny(who: string, why: string): void;
}

interface Member {
  updates: Set<(update: PresenceUpdate) => void>;
  rooms: Set<(rooms: DeskRoom[]) => void>;
  denied: Set<(why: string) => void>;
}

function listen<T>(set: Set<T>, listener: T): () => void {
  set.add(listener);
  return () => set.delete(listener);
}

export function createFakeHub(): FakeHub {
  const members = new Map<string, Member>();
  let rooms: DeskRoom[] = [];

  return {
    join(who) {
      const member: Member = { updates: new Set(), rooms: new Set(), denied: new Set() };
      members.set(who, member);
      return {
        send(document, place, room) {
          for (const [other, { updates }] of members) {
            if (other === who) continue;
            for (const listener of updates) listener({ who, document, place, room });
          }
        },
        subscribe: (listener) => listen(member.updates, listener),
        askRooms() {
          for (const listener of member.rooms) listener(rooms);
        },
        onRooms: (listener) => listen(member.rooms, listener),
        onDenied: (listener) => listen(member.denied, listener),
      };
    },
    setRooms(next) {
      rooms = next;
      for (const { rooms: listeners } of members.values()) for (const listener of listeners) listener(rooms);
    },
    deny(who, why) {
      for (const listener of members.get(who)?.denied ?? []) listener(why);
    },
  };
}
