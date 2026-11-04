/**
 * 相手の居場所を、Markdown エディタの行に付ける印へ変える（DOM 非依存の純ロジック）。
 *
 * - 同じ行にいる人は 1 つの印にまとめる（行の端に名前が並ぶ）。
 * - 色は名前から決める。どの PC で見ても同じ人は同じ色になる。
 * - 名前は相手から届いた文字なので、制御文字・向きを変える文字を落とす。
 *   残すと、別の人の名前に見せかけられる。
 * - この写しに無い行（相手が先に行を足した・別のブランチ）には印を付けない。
 */

import type { VisiblePeer } from './peers';

/** 行の端に出す名前の上限（文字数・省略記号を含む）。 */
export const MAX_LABEL_CHARS = 16;

export interface LineMarkPeer {
  who: string;
  label: string;
  /** 色相（0〜359）。 */
  hue: number;
  faded: boolean;
  otherBranch: boolean;
}

export interface LineMark {
  /** 1 始まりの行番号。 */
  line: number;
  peers: LineMarkPeer[];
}

/** 名前から色相を決める（FNV-1a）。 */
export function peerHue(who: string): number {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(who)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % 360;
}

/** 行の端に出す名前。見えない文字を落とし、長ければ切って「…」を付ける。 */
export function peerLabel(who: string): string {
  const chars = [...who.replace(/[\p{Cc}\p{Cf}]/gu, '').trim()];
  if (chars.length === 0) return '?';
  if (chars.length <= MAX_LABEL_CHARS) return chars.join('');
  return `${chars.slice(0, MAX_LABEL_CHARS - 1).join('')}…`;
}

/** 相手の居場所を行ごとの印にする。行の上から順に返す。 */
export function lineMarks(peers: readonly VisiblePeer[], lineCount: number): LineMark[] {
  const byLine = new Map<number, LineMarkPeer[]>();
  for (const peer of peers) {
    if (peer.place.kind !== 'markdown') continue;
    const { line } = peer.place;
    if (line < 1 || line > lineCount) continue;
    const entry: LineMarkPeer = {
      who: peer.who,
      label: peerLabel(peer.who),
      hue: peerHue(peer.who),
      faded: peer.faded,
      otherBranch: peer.otherBranch,
    };
    byLine.set(line, [...(byLine.get(line) ?? []), entry]);
  }
  return [...byLine]
    .sort(([a], [b]) => a - b)
    .map(([line, onLine]) => ({ line, peers: [...onLine].sort((a, b) => a.who.localeCompare(b.who)) }));
}
