/**
 * 書いている途中の線を、割符の机で相手へ流す荷に割る・届いた荷から相手の線を組み直す（DOM 非依存）。
 *
 * 机は荷を読まずに、まとめず・捨てず・送った順に配る。だから線は「書き始め」と「足した点」に分けて
 * 送れば、受け手で同じ線に組み直せる。1 つの荷は上限に収まるよう点の途中で分ける。
 * 届いた線は会議中だけのもので、保存しない（残すのは書いた本人の手元の線だけ）。
 */

import type { InkStroke, InkTool } from '../preview/inkModel';

/** 机が運ぶ荷の上限（バイト）。行全体の 1 KB から、外箱の欄の分を引いた値。 */
export const MAX_INK_PAYLOAD_BYTES = 900;
/**
 * 書いている途中の線を送る間隔（ミリ秒）。机は 1 人の書き込みを 1 秒 20 行までしか通さず、
 * 超えた行は送り直されずに消える。ペンの動きは 1 秒 60 回前後来るので、間隔ごとに最新の形だけを送る。
 */
export const INK_SEND_INTERVAL_MS = 100;
/** 1 人分として持つ線の上限。超えたら古い線から捨てる（相手が消さずに書き続けても膨らまない）。 */
const MAX_PEER_STROKES = 500;
/** 1 本の線として持つ点の上限（座標の数）。超えた分は描かない。 */
const MAX_STROKE_NUMBERS = 20000;
const MAX_ID_LENGTH = 64;
const TOOLS: readonly InkTool[] = ['pen', 'highlighter'];
const COLOR = /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i;
const DIGITS = 1e4;

export type InkPayload =
  | { t: 'begin'; id: string; sheet: string; tool: InkTool; color: string; width: number; points: number[] }
  | { t: 'more'; id: string; points: number[] }
  | { t: 'remove'; id: string }
  | { t: 'clear' };

const round = (n: number): number => Math.round(n * DIGITS) / DIGITS;
const byteLength = (text: string): number => new TextEncoder().encode(text).length;
/** 机の行の文字列欄に埋めたときの長さ（引用符や \ を逃がした後）。 */
const escapedLength = (text: string): number => byteLength(JSON.stringify(text)) - 2;

/**
 * 点を上限に収まる荷に分ける。head は点の欄より前の部分（`{"t":…,"p":[` まで）。
 * 最初の荷は head、続きは more の頭で組む。
 */
function chunk(firstHead: string, moreHead: string, numbers: readonly number[], limit: number): string[] {
  const out: string[] = [];
  let head = firstHead;
  let body: string[] = [];
  let size = escapedLength(head) + 2;
  for (let i = 0; i + 1 < numbers.length; i += 2) {
    const pair = `${round(numbers[i]!)},${round(numbers[i + 1]!)}`;
    const add = byteLength(pair) + (body.length > 0 ? 1 : 0);
    if (body.length > 0 && size + add > limit) {
      out.push(`${head}${body.join(',')}]}`);
      head = moreHead;
      body = [];
      size = escapedLength(head) + 2;
    }
    body.push(pair);
    size += byteLength(pair) + (body.length > 1 ? 1 : 0);
  }
  if (body.length > 0 || out.length === 0) out.push(`${head}${body.join(',')}]}`);
  return out;
}

export interface InkSender {
  /** 書いている線の今の形。前に送った分より後ろの点だけを送る。 */
  update(id: string, sheet: string, stroke: InkStroke): void;
  remove(id: string): void;
  clear(): void;
  /** 溜めている形があれば今すぐ送る（ペンを離したとき）。 */
  flush(): void;
}

/**
 * limit は 1 つの荷が机の行の中で占めてよい長さ。文書名が長いと行に残る余地が減るので、
 * 呼ぶ側が行の大きさから決めて渡す（deskLine の inkPayloadBudget）。
 */
export function createInkSender(send: (payload: string) => void, limit = MAX_INK_PAYLOAD_BYTES): InkSender {
  // 線ごとに、送り終えた座標の数。
  const sent = new Map<string, number>();

  function remove(id: string): void {
    if (!sent.delete(id)) return;
    send(JSON.stringify({ t: 'remove', id }));
  }

  return {
    update(id, sheet, stroke) {
      const done = sent.get(id);
      // 点が減った（別の線に置き換わった）ときは、消してから書き始めとして送り直す。
      if (done !== undefined && stroke.points.length < done) remove(id);
      const from = sent.get(id);
      const moreHead = `{"t":"more","id":${JSON.stringify(id)},"p":[`;
      let payloads: string[];
      if (from === undefined) {
        const head =
          `{"t":"begin","id":${JSON.stringify(id)},"sheet":${JSON.stringify(sheet)},` +
          `"tool":${JSON.stringify(stroke.tool)},"color":${JSON.stringify(stroke.color)},` +
          `"width":${round(stroke.width)},"p":[`;
        payloads = chunk(head, moreHead, stroke.points, limit);
      } else {
        if (stroke.points.length === from) return;
        payloads = chunk(moreHead, moreHead, stroke.points.slice(from), limit);
      }
      sent.set(id, stroke.points.length);
      for (const payload of payloads) send(payload);
    },
    remove,
    clear() {
      sent.clear();
      send(JSON.stringify({ t: 'clear' }));
    },
    // 渡された形はその場で送るので、溜めているものは無い。
    flush() {},
  };
}

export interface InkClock {
  now(): number;
  setTimeout(run: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

const systemClock: InkClock = {
  now: () => Date.now(),
  setTimeout: (run, ms) => setTimeout(run, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export interface PacedInkSender extends InkSender {
  /** 溜めている形を送らずに捨てる（送り先が替わるとき）。 */
  cancel(): void;
}

/**
 * update を interval に 1 回までにまとめる。間隔の内に来た形は最新のものだけを残し、間隔が来たら送る。
 * 送る順は変えない: 消す・全部消すの前に、別の線の溜めは先に送り、同じ線の溜めは捨てる。
 */
export function paceInkSender(
  inner: InkSender,
  interval = INK_SEND_INTERVAL_MS,
  clock: InkClock = systemClock,
): PacedInkSender {
  let lastAt = -Infinity;
  let pending: { id: string; sheet: string; stroke: InkStroke } | null = null;
  let timer: unknown = null;

  function stopTimer(): void {
    if (timer !== null) clock.clearTimeout(timer);
    timer = null;
  }

  function cancel(): void {
    stopTimer();
    pending = null;
  }

  function flush(): void {
    stopTimer();
    if (pending === null) return;
    const { id, sheet, stroke } = pending;
    pending = null;
    lastAt = clock.now();
    inner.update(id, sheet, stroke);
  }

  return {
    update(id, sheet, stroke) {
      if (pending !== null && pending.id !== id) flush();
      const wait = lastAt + interval - clock.now();
      if (pending === null && wait <= 0) {
        lastAt = clock.now();
        inner.update(id, sheet, stroke);
        return;
      }
      pending = { id, sheet, stroke };
      if (timer === null) timer = clock.setTimeout(flush, Math.max(wait, 0));
    },
    remove(id) {
      if (pending?.id === id) cancel();
      else flush();
      inner.remove(id);
    },
    clear() {
      cancel();
      inner.clear();
    },
    flush,
    cancel,
  };
}

function isId(value: unknown): value is string {
  return typeof value === 'string' && value !== '' && value.length <= MAX_ID_LENGTH;
}

function isPoints(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length % 2 === 0 &&
    value.every((n) => typeof n === 'number' && Number.isFinite(n))
  );
}

/** 相手から届いた荷を読む。形の合わないものは null（黙って捨てる）。 */
export function decodeInkPayload(text: string): InkPayload | null {
  if (text === '' || byteLength(text) > MAX_INK_PAYLOAD_BYTES) return null;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const r = value as Record<string, unknown>;
  switch (r.t) {
    case 'begin': {
      const { id, sheet, tool, color, width, p } = r;
      if (!isId(id) || !isId(sheet)) return null;
      if (!TOOLS.includes(tool as InkTool)) return null;
      if (typeof color !== 'string' || !COLOR.test(color)) return null;
      if (typeof width !== 'number' || !Number.isFinite(width) || width <= 0) return null;
      if (!isPoints(p) || p.length === 0) return null;
      return { t: 'begin', id, sheet, tool: tool as InkTool, color, width, points: p };
    }
    case 'more':
      if (!isId(r.id) || !isPoints(r.p) || r.p.length === 0) return null;
      return { t: 'more', id: r.id, points: r.p };
    case 'remove':
      return isId(r.id) ? { t: 'remove', id: r.id } : null;
    case 'clear':
      return { t: 'clear' };
    default:
      return null;
  }
}

export interface PeerStroke {
  who: string;
  stroke: InkStroke;
}

export interface PeerInk {
  /** 相手から届いた荷を当てる。 */
  apply(who: string, payload: string): void;
  /** そのページにある相手の線（届いた順）。 */
  strokes(sheet: string): PeerStroke[];
  /** 相手の線を全部捨てる（部屋を抜けた・文書を閉じた）。 */
  drop(who: string): void;
  /** 全員の線を捨てる。 */
  reset(): void;
  onChange(listener: () => void): () => void;
}

export function createPeerInk(): PeerInk {
  const byWho = new Map<string, Map<string, { sheet: string; stroke: InkStroke }>>();
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of listeners) listener();
  };

  function change(who: string, payload: InkPayload): boolean {
    let mine = byWho.get(who);
    switch (payload.t) {
      case 'begin': {
        if (!mine) byWho.set(who, (mine = new Map()));
        mine.delete(payload.id);
        if (mine.size >= MAX_PEER_STROKES) mine.delete(mine.keys().next().value!);
        const { sheet, tool, color, width, points } = payload;
        mine.set(payload.id, { sheet, stroke: { tool, color, width, points: points.slice(0, MAX_STROKE_NUMBERS) } });
        return true;
      }
      case 'more': {
        const entry = mine?.get(payload.id);
        // 書き始めを取りこぼした続きは、どの線に付くか分からないので捨てる。
        if (!entry) return false;
        const room = MAX_STROKE_NUMBERS - entry.stroke.points.length;
        if (room <= 0) return false;
        entry.stroke = { ...entry.stroke, points: [...entry.stroke.points, ...payload.points.slice(0, room)] };
        return true;
      }
      case 'remove':
        return mine?.delete(payload.id) ?? false;
      case 'clear':
        return byWho.delete(who);
    }
  }

  return {
    apply(who, text) {
      const payload = decodeInkPayload(text);
      if (payload !== null && change(who, payload)) notify();
    },
    strokes(sheet) {
      const out: PeerStroke[] = [];
      for (const [who, mine] of byWho) {
        for (const entry of mine.values()) if (entry.sheet === sheet) out.push({ who, stroke: entry.stroke });
      }
      return out;
    },
    drop(who) {
      if (byWho.delete(who)) notify();
    },
    reset() {
      if (byWho.size === 0) return;
      byWho.clear();
      notify();
    },
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
