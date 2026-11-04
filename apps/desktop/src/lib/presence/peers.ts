/**
 * 相手の居場所の表（DOM 非依存の純ロジック・時刻は呼び出し側が渡す）。
 *
 * 落ちた相手からは「閉じた」が来ない。そのため送る側が 15 秒ごとに送り直し（sender.ts）、
 * 受け手は 45 秒届かなければ薄く、2 分で消す。送り直し 3 回分を逃したら薄くする勘定。
 */

import type { PresenceUpdate } from './gateway';
import type { Place } from './place';

export const FADE_AFTER_MS = 45_000;
export const REMOVE_AFTER_MS = 120_000;

interface PeerEntry {
  who: string;
  document: string;
  room: string;
  place: Place;
  seenAt: number;
}

export type PeerTable = ReadonlyMap<string, PeerEntry>;

export interface PeerView {
  document: string;
  room: string;
  /** 自分が見ているブランチ。相手と違えば印を付ける。 */
  branch: string;
}

export interface VisiblePeer {
  who: string;
  place: Place;
  faded: boolean;
  otherBranch: boolean;
}

function keyOf(update: Pick<PresenceUpdate, 'who' | 'document' | 'room'>): string {
  return JSON.stringify([update.room, update.who, update.document]);
}

/** 届いた居場所を反映した新しい表を返す。 */
export function applyUpdate(table: PeerTable, update: PresenceUpdate, now: number): PeerTable {
  const next = new Map(table);
  const key = keyOf(update);
  if (update.place === null) {
    next.delete(key);
  } else {
    next.set(key, { who: update.who, document: update.document, room: update.room, place: update.place, seenAt: now });
  }
  return next;
}

/** 2 分届いていない相手を落とした新しい表を返す。 */
export function prunePeers(table: PeerTable, now: number): PeerTable {
  return new Map([...table].filter(([, entry]) => now - entry.seenAt < REMOVE_AFTER_MS));
}

/** 今の文書・ルームにいる相手を、名前順で返す。 */
export function visiblePeers(table: PeerTable, view: PeerView, now: number): VisiblePeer[] {
  return [...table.values()]
    .filter((entry) => entry.document === view.document && entry.room === view.room)
    .filter((entry) => now - entry.seenAt < REMOVE_AFTER_MS)
    .sort((a, b) => a.who.localeCompare(b.who))
    .map((entry) => ({
      who: entry.who,
      place: entry.place,
      faded: now - entry.seenAt >= FADE_AFTER_MS,
      otherBranch: entry.place.branch !== view.branch,
    }));
}
