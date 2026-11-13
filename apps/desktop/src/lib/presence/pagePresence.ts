/**
 * 画面 1 枚が開いている文書について、居場所を送り、相手の表を引く（DOM 非依存）。
 *
 * 部屋は利用者が机の部屋一覧から選ぶ。選ぶまでは何も送らない（既定は共有しない）。
 * 部屋を替えたら、前の部屋で「閉じた」を送ってから、新しい部屋へ今の場所を送り直す。
 * 選んでいた部屋が一覧から消えたら（抜けた・解散した）共有をやめる。
 * 線（出入口）は部屋と関係なく 1 本なので、部屋を替えても繋ぎ直さない。
 */

import type { DeskRoom, PresenceGateway } from './gateway';
import type { VisiblePeer } from './peers';
import type { Place } from './place';
import { createPresenceSession, type PresenceSession } from './session';

/** 出入口の移り変わりを渡し続ける口（connectDesk の形）。戻り値でやめる。 */
export type PresenceConnect = (onGateway: (gateway: PresenceGateway | null) => void) => Promise<() => void>;

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
  onChange(listener: () => void): () => void;
  dispose(): void;
}

export function createPagePresence(connect: PresenceConnect, now: () => number = Date.now): PagePresence {
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

  const notify = () => {
    for (const listener of listeners) listener();
  };

  function leave(): void {
    if (session && document !== null) session.move(document, null);
  }

  function setRoom(next: string | null): void {
    denied = null;
    if (next === room) {
      notify();
      return;
    }
    leave();
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
    stopGateway = () => {
      stopRooms();
      stopDenied();
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
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      disposed = true;
      leave();
      stopSession?.();
      session?.dispose();
      session = null;
      stopGateway?.();
      listeners.clear();
      stopConnect?.();
    },
  };
}
