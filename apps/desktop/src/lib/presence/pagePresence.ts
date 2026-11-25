/**
 * 画面 1 枚が開いている文書について、居場所を送り、相手の表を引く（DOM 非依存）。
 *
 * 部屋は利用者が机の部屋一覧から選ぶ。選ぶまでは何も送らない（既定は共有しない）。
 * 部屋を替えたら、前の部屋で「閉じた」を送ってから、新しい部屋へ今の場所を送り直す。
 * 選んでいた部屋が一覧から消えたら（抜けた・解散した）共有をやめる。
 * 線（出入口）は部屋と関係なく 1 本なので、部屋を替えても繋ぎ直さない。
 *
 * 書き込みも同じ部屋・文書の相手とだけ送り合う。部屋か文書を替えたら、前の所へ「消した」を送り、
 * 届いていた相手の線を捨てる（相手の線は会議中だけのもので、保存しない）。
 */

import type { DeskRoom, PresenceGateway } from './gateway';
import {
  createInkSender,
  createPeerInk,
  MAX_INK_PAYLOAD_BYTES,
  paceInkSender,
  type InkSender,
  type PacedInkSender,
  type PeerStroke,
} from './inkShare';
import type { VisiblePeer } from './peers';
import type { Place } from './place';
import { createPresenceSession, type PresenceSession } from './session';

/** 出入口の移り変わりを渡し続ける口（connectDesk の形）。戻り値でやめる。 */
export type PresenceConnect = (onGateway: (gateway: PresenceGateway | null) => void) => Promise<() => void>;

/** 文書・部屋ごとに、書き込みの荷 1 つに使える長さ。送れないときは null（deskLine の inkPayloadBudget の形）。 */
export type InkBudget = (document: string, room: string) => number | null;

export interface PagePresence {
  /** 開いている文書の名前。名前を付けられない文書は null（何も送らない）。 */
  open(document: string | null): void;
  /** 今いる場所。送れない場所は null（前の場所のままにする）。 */
  moveTo(place: Place | null): void;
  /** 共有する部屋。null は共有しない。 */
  setRoom(room: string | null): void;
  room(): string | null;
  /** 机から最後に届いた部屋の一覧。 */
  rooms(): DeskRoom[];
  /** 部屋の一覧を聞き直す。 */
  askRooms(): void;
  /** 机に断られた理由。部屋を選び直すと消える。 */
  denied(): string | null;
  /** 開いている文書にいる相手。 */
  peers(branch: string): VisiblePeer[];
  /** 自分の書き込みを送る口。部屋・文書が決まっていないときは何もしない。 */
  ink: InkSender;
  /** そのページにある相手の線。 */
  peerStrokes(sheet: string): PeerStroke[];
  /** 相手の線が変わったら知らせる。 */
  onInk(listener: () => void): () => void;
  onChange(listener: () => void): () => void;
  dispose(): void;
}

export function createPagePresence(
  connect: PresenceConnect,
  now: () => number = Date.now,
  inkBudget: InkBudget = () => MAX_INK_PAYLOAD_BYTES
): PagePresence {
  let gateway: PresenceGateway | null = null;
  let stopGateway: (() => void) | null = null;
  let session: PresenceSession | null = null;
  let room: string | null = null;
  let rooms: DeskRoom[] = [];
  let denied: string | null = null;
  let document: string | null = null;
  // 部屋を選ぶ前・選び直した後にも今の場所を送れるよう、セッションとは別に持つ。
  let place: Place | null = null;
  let disposed = false;
  let stopSession: (() => void) | null = null;
  const listeners = new Set<() => void>();
  const peerInk = createPeerInk();
  // 今の部屋・文書へ送る口。送った荷があるかを覚えておき、替えるときだけ「消した」を送る。
  let inkSender: PacedInkSender | null = null;
  let inkSent = false;

  const notify = () => {
    for (const listener of listeners) listener();
  };

  function leave(): void {
    if (session && document !== null) session.move(document, null);
  }

  function inkTo(): InkSender | null {
    if (inkSender !== null) return inkSender;
    const target = gateway;
    if (target === null || room === null || document === null) return null;
    const [r, d] = [room, document];
    const limit = inkBudget(d, r);
    if (limit === null) return null;
    // 間引きも送り先ごとに持つ。替えた直後の書き始めは、前の所の間隔を待たずに送る。
    inkSender = paceInkSender(
      createInkSender((payload) => {
        inkSent = true;
        target.sendInk(d, payload, r);
      }, limit)
    );
    return inkSender;
  }

  /** 部屋・文書・出入口を替える前に呼ぶ。前の所へ自分の線を消すよう知らせ、相手の線を捨てる。 */
  function resetInk(): void {
    // 溜めていた形は前の部屋・文書のもの。新しい送り先へは次の update で書き始めから送る。
    inkSender?.cancel();
    if (inkSent) inkSender?.clear();
    inkSender = null;
    inkSent = false;
    peerInk.reset();
  }

  const ink: InkSender = {
    update: (id, sheet, stroke) => inkTo()?.update(id, sheet, stroke),
    remove: (id) => inkTo()?.remove(id),
    clear: () => inkTo()?.clear(),
    flush: () => inkSender?.flush(),
  };

  function setRoom(next: string | null): void {
    denied = null;
    if (next === room) {
      notify();
      return;
    }
    leave();
    resetInk();
    stopSession?.();
    session?.dispose();
    session = null;
    stopSession = null;
    room = next;
    if (next !== null) {
      session = createPresenceSession(next, now);
      stopSession = session.onChange(notify);
      session.setGateway(gateway);
      if (document !== null && place !== null) session.move(document, place);
    }
    notify();
  }

  function attach(next: PresenceGateway | null): void {
    stopGateway?.();
    stopGateway = null;
    // 繋ぎ直した相手は、前の線に送った分を知らない。書き始めから送り直す。
    inkSender?.cancel();
    inkSender = null;
    inkSent = false;
    peerInk.reset();
    gateway = next;
    session?.setGateway(next);
    if (next === null) return;
    const stopRooms = next.onRooms((list) => {
      rooms = list;
      if (room !== null && !list.some((r) => r.id === room)) setRoom(null);
      else notify();
    });
    const stopDenied = next.onDenied((why) => {
      denied = why;
      notify();
    });
    const stopInk = next.subscribeInk((update) => {
      if (update.room === room && update.document === document) peerInk.apply(update.who, update.payload);
    });
    // 相手が文書を閉じたら、その相手の線はもう指す先が無い。
    const stopClosed = next.subscribe((update) => {
      if (update.place === null && update.room === room && update.document === document) peerInk.drop(update.who);
    });
    stopGateway = () => {
      stopRooms();
      stopDenied();
      stopInk();
      stopClosed();
    };
    next.askRooms();
  }

  let stopConnect: (() => void) | null = null;
  void connect(attach).then((stop) => {
    if (disposed) stop();
    else stopConnect = stop;
  });

  return {
    open(next) {
      if (next === document) return;
      leave();
      resetInk();
      document = next;
      place = null;
      notify();
    },
    moveTo(next) {
      if (next === null || document === null) return;
      place = next;
      session?.move(document, next);
    },
    setRoom,
    room: () => room,
    rooms: () => rooms,
    askRooms() {
      gateway?.askRooms();
    },
    denied: () => denied,
    peers(branch) {
      if (session === null || room === null || document === null) return [];
      return session.peers({ document, room, branch });
    },
    ink,
    peerStrokes: (sheet) => peerInk.strokes(sheet),
    onInk: (listener) => peerInk.onChange(listener),
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      disposed = true;
      leave();
      resetInk();
      stopSession?.();
      session?.dispose();
      session = null;
      stopGateway?.();
      listeners.clear();
      stopConnect?.();
    },
  };
}
