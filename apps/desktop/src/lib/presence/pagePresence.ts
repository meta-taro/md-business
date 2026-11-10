/**
 * 画面 1 枚が開いている文書について、居場所を送り、相手の表を引く（DOM 非依存）。
 *
 * 部屋は文書の名前のリポ部分（`host/owner/repo`）にする。同じリポを開いている人どうしが
 * 互いを見る。リポを替えたら部屋ごと替え、前の文書には「閉じた」を送ってから離れる。
 * 線（出入口）は部屋と関係なく 1 本なので、部屋を替えても繋ぎ直さない。
 */

import type { PresenceGateway } from './gateway';
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
  /** 開いている文書にいる相手。 */
  peers(branch: string): VisiblePeer[];
  onChange(listener: () => void): () => void;
  dispose(): void;
}

/** 文書の名前から部屋を決める。 */
export function roomOf(document: string | null): string | null {
  if (document === null) return null;
  const at = document.indexOf('#');
  return at > 0 ? document.slice(0, at) : null;
}

export function createPagePresence(connect: PresenceConnect, now: () => number = Date.now): PagePresence {
  let gateway: PresenceGateway | null = null;
  let session: PresenceSession | null = null;
  let room: string | null = null;
  let document: string | null = null;
  let disposed = false;
  let stopSession: (() => void) | null = null;
  const listeners = new Set<() => void>();

  const notify = () => {
    for (const listener of listeners) listener();
  };

  function leave(): void {
    if (session && document !== null) session.move(document, null);
  }

  function switchRoom(next: string | null): void {
    if (next === room) return;
    stopSession?.();
    session?.dispose();
    session = null;
    stopSession = null;
    room = next;
    if (next !== null) {
      session = createPresenceSession(next, now);
      stopSession = session.onChange(notify);
      session.setGateway(gateway);
    }
    notify();
  }

  let stopConnect: (() => void) | null = null;
  void connect((next) => {
    gateway = next;
    session?.setGateway(next);
  }).then((stop) => {
    if (disposed) stop();
    else stopConnect = stop;
  });

  return {
    open(next) {
      if (next === document) return;
      leave();
      switchRoom(roomOf(next));
      document = room === null ? null : next;
      notify();
    },
    moveTo(place) {
      if (place === null || session === null || document === null) return;
      session.move(document, place);
    },
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
      listeners.clear();
      stopConnect?.();
    },
  };
}
