/**
 * 割符の机の線に載せた居場所の出入口。
 *
 * 線そのもの（名前付きパイプ / ソケット）はここでは持たず、1 行ずつ書く・届く口だけを受け取る。
 * 繋ぎ直したときは出入口ごと作り直す（聞く宣言は繋いだ線ごとに要る）。
 */

import {
  decodeDeniedLine,
  decodeDeskLine,
  decodeRoomsLine,
  encodePresenceLine,
  ROOMS_LINE,
  SEAT_LINE,
  SUBSCRIBE_LINE,
} from './deskLine';
import type { PresenceGateway } from './gateway';

/** 机へ繋いだ 1 本の線。行は改行を含まない JSON 1 つ。 */
export interface DeskTransport {
  write(line: string): void;
  /** 机から届いた行を受け取る。戻り値で受け取りをやめる。 */
  onLine(listener: (line: string) => void): () => void;
}

export function createDeskGateway(transport: DeskTransport): PresenceGateway {
  transport.write(SEAT_LINE);
  transport.write(SUBSCRIBE_LINE);
  return {
    send(document, place, room) {
      const line = encodePresenceLine(document, place, room);
      if (line !== null) transport.write(line);
    },
    subscribe(listener) {
      return transport.onLine((line) => {
        const update = decodeDeskLine(line);
        if (update !== null) listener(update);
      });
    },
    askRooms() {
      transport.write(ROOMS_LINE);
    },
    onRooms(listener) {
      return transport.onLine((line) => {
        const rooms = decodeRoomsLine(line);
        if (rooms !== null) listener(rooms);
      });
    },
    onDenied(listener) {
      return transport.onLine((line) => {
        const why = decodeDeniedLine(line);
        if (why !== null) listener(why);
      });
    },
  };
}
