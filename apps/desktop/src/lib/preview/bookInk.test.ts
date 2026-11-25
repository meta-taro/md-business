// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { attachBookInk, INK_SAVE_DELAY_MS, type BookInk, type InkStore } from './bookInk';
import { SHEET_BASE_WIDTH } from './bookSheets';
import { parseInk, type InkStroke } from './inkModel';
import type { PeerStroke } from '../presence/inkShare';

const LABELS = { pen: 'Pen', highlighter: 'Highlighter', eraser: 'Eraser' };

/** jsdom は組版をしないので、ページ（縮めた後の見た目）の位置を決め打ちで与える。 */
function place(fit: HTMLElement, left: number, top: number, width: number): void {
  fit.getBoundingClientRect = () =>
    ({ left, top, width, height: width * 2, right: left + width, bottom: top + width * 2 }) as DOMRect;
}

function memoryStore(initial: string | null = null): InkStore & { saved: string[] } {
  const saved: string[] = [];
  return {
    saved,
    load: () => Promise.resolve(initial),
    save: (json) => {
      saved.push(json);
      return Promise.resolve();
    },
  };
}

const button = (title: string): HTMLButtonElement =>
  document.querySelector<HTMLButtonElement>(`.mdb-ink-bar button[title="${title}"]`)!;
const svgOf = (fit: HTMLElement): SVGSVGElement => fit.querySelector('svg.mdb-ink')!;

function draw(fit: HTMLElement, points: [number, number][]): void {
  const svg = svgOf(fit);
  const [first, ...rest] = points;
  const ev = (type: string, [x, y]: [number, number]): MouseEvent =>
    new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true, button: 0 });
  svg.dispatchEvent(ev('pointerdown', first!));
  for (const p of rest) svg.dispatchEvent(ev('pointermove', p));
  svg.dispatchEvent(ev('pointerup', rest.at(-1) ?? first!));
}

let fits: HTMLElement[] = [];
let ink: BookInk | null = null;

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML =
    '<div class="mdb-sheet"><div class="mdb-sheet-fit">一</div></div>' +
    '<div class="mdb-sheet"><div class="mdb-sheet-fit">二</div></div>';
  fits = [...document.querySelectorAll<HTMLElement>('.mdb-sheet-fit')];
  // 1 ページ目は半分に縮めて (100, 50) に置いてある
  place(fits[0]!, 100, 50, SHEET_BASE_WIDTH / 2);
  place(fits[1]!, 500, 50, SHEET_BASE_WIDTH / 2);
});

afterEach(() => {
  ink?.destroy();
  ink = null;
  vi.useRealTimers();
});

describe('attachBookInk', () => {
  it('各ページに線を描く面を置き、道具を選ぶまでは描かない', async () => {
    const store = memoryStore();
    ink = attachBookInk(document, fits, ['p.1', 'p.2'], { store, labels: LABELS });
    await vi.runAllTimersAsync();
    expect(svgOf(fits[0]!)).not.toBeNull();
    expect(ink.active()).toBe(false);
    draw(fits[0]!, [[110, 60], [150, 60]]);
    await vi.advanceTimersByTimeAsync(INK_SAVE_DELAY_MS);
    expect(store.saved).toHaveLength(0);
  });

  it('ペンで描いた線を、ページの組み幅を 1 とした座標で保存する', async () => {
    const store = memoryStore();
    ink = attachBookInk(document, fits, ['p.1', 'p.2'], { store, labels: LABELS });
    await vi.runAllTimersAsync();
    button('Pen').click();
    expect(ink.active()).toBe(true);
    // 見た目の幅は 320px。左上から 32px 右・16px 下は、組み幅の 0.1・0.05
    draw(fits[0]!, [[132, 66], [196, 66]]);
    expect(svgOf(fits[0]!).querySelectorAll('path')).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(INK_SAVE_DELAY_MS);
    expect(store.saved).toHaveLength(1);
    const data = parseInk(store.saved[0]!);
    expect(data.sheets['p.1']![0]!.points).toEqual([0.1, 0.05, 0.3, 0.05]);
    expect(data.sheets['p.1']![0]!.tool).toBe('pen');
  });

  it('同じ道具をもう一度押すと描くのをやめる', async () => {
    ink = attachBookInk(document, fits, ['p.1', 'p.2'], { store: memoryStore(), labels: LABELS });
    button('Pen').click();
    button('Pen').click();
    expect(ink.active()).toBe(false);
  });

  it('保存してあった線を開いたときに描き、消しゴムで消すと保存し直す', async () => {
    const saved = JSON.stringify({
      v: 1,
      sheets: { 'p.2': [{ tool: 'pen', color: '#000', width: 0.004, points: [0.1, 0.1, 0.3, 0.1] }] },
    });
    const store = memoryStore(saved);
    ink = attachBookInk(document, fits, ['p.1', 'p.2'], { store, labels: LABELS });
    await vi.runAllTimersAsync();
    expect(svgOf(fits[1]!).querySelectorAll('path')).toHaveLength(1);
    button('Eraser').click();
    draw(fits[1]!, [[500 + 64, 50 + 32]]);
    expect(svgOf(fits[1]!).querySelectorAll('path')).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(INK_SAVE_DELAY_MS);
    expect(parseInk(store.saved.at(-1)!).sheets).toEqual({});
  });

  it('番号の重なるページは別のページとして持つ', async () => {
    const store = memoryStore();
    ink = attachBookInk(document, fits, ['p.1', 'p.1'], { store, labels: LABELS });
    await vi.runAllTimersAsync();
    button('Pen').click();
    draw(fits[1]!, [[510, 60], [560, 60]]);
    await ink.flush();
    expect(Object.keys(parseInk(store.saved.at(-1)!).sheets)).toEqual(['#2']);
  });

  it('外すと面と道具を片付け、書きかけを保存する', async () => {
    const store = memoryStore();
    ink = attachBookInk(document, fits, ['p.1', 'p.2'], { store, labels: LABELS });
    await vi.runAllTimersAsync();
    button('Pen').click();
    draw(fits[0]!, [[110, 60], [150, 60]]);
    ink.destroy();
    ink = null;
    await vi.runAllTimersAsync();
    expect(store.saved).toHaveLength(1);
    expect(document.querySelector('svg.mdb-ink')).toBeNull();
    expect(document.querySelector('.mdb-ink-bar')).toBeNull();
  });
});

describe('attachBookInk の共有', () => {
  function fakeShare() {
    const calls: [string, ...unknown[]][] = [];
    const listeners = new Set<() => void>();
    let peers: Record<string, PeerStroke[]> = {};
    return {
      calls,
      setPeers(next: Record<string, PeerStroke[]>) {
        peers = next;
        for (const listener of listeners) listener();
      },
      share: {
        sender: {
          update: (id: string, sheet: string, stroke: InkStroke) => calls.push(['update', id, sheet, stroke.points.length]),
          remove: (id: string) => calls.push(['remove', id]),
          clear: () => calls.push(['clear']),
          flush: () => calls.push(['flush']),
        },
        peerStrokes: (sheet: string) => peers[sheet] ?? [],
        onChange(listener: () => void) {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      },
    };
  }
  const theirs: InkStroke = { tool: 'pen', color: '#1a6fd8', width: 0.004, points: [0.5, 0.5, 0.6, 0.5] };

  it('書いている途中の線を、点が増えるたびに同じ id で送る', async () => {
    const { calls, share } = fakeShare();
    ink = attachBookInk(document, fits, ['p.1', 'p.2'], { store: memoryStore(), labels: LABELS, share });
    await vi.runAllTimersAsync();
    button('Pen').click();
    draw(fits[0]!, [[132, 66], [164, 66], [196, 66]]);
    const updates = calls.filter((c) => c[0] === 'update');
    expect(updates.map((c) => c[3])).toEqual([2, 4, 6, 6]);
    // ペンを離したら、溜めていた分を待たずに送らせる
    expect(calls.at(-1)).toEqual(['flush']);
    expect(new Set(updates.map((c) => c[1])).size).toBe(1);
    expect(updates[0]![2]).toBe('p.1');
  });

  it('消しゴムで消した自分の線は、消したと送る', async () => {
    const { calls, share } = fakeShare();
    ink = attachBookInk(document, fits, ['p.1', 'p.2'], { store: memoryStore(), labels: LABELS, share });
    await vi.runAllTimersAsync();
    button('Pen').click();
    draw(fits[0]!, [[132, 66], [196, 66]]);
    const id = calls[0]![1];
    button('Eraser').click();
    draw(fits[0]!, [[132, 66]]);
    expect(calls.at(-1)).toEqual(['remove', id]);
  });

  it('相手の線を重ねて描き、変わったら描き直す。相手の線は保存しない', async () => {
    const { setPeers, share } = fakeShare();
    const store = memoryStore();
    ink = attachBookInk(document, fits, ['p.1', 'p.2'], { store, labels: LABELS, share });
    await vi.runAllTimersAsync();
    setPeers({ 'p.2': [{ who: 'other', stroke: theirs }] });
    expect(svgOf(fits[1]!).querySelectorAll('path.mdb-ink-peer')).toHaveLength(1);
    expect(svgOf(fits[0]!).querySelectorAll('path')).toHaveLength(0);
    setPeers({});
    expect(svgOf(fits[1]!).querySelectorAll('path')).toHaveLength(0);
    await ink.flush();
    expect(store.saved).toHaveLength(0);
  });

  it('書いている途中に相手の線が届いても、書きかけの線を消さない', async () => {
    const { setPeers, share } = fakeShare();
    ink = attachBookInk(document, fits, ['p.1', 'p.2'], { store: memoryStore(), labels: LABELS, share });
    await vi.runAllTimersAsync();
    button('Pen').click();
    const svg = svgOf(fits[0]!);
    svg.dispatchEvent(new MouseEvent('pointerdown', { clientX: 132, clientY: 66, bubbles: true, button: 0 }));
    setPeers({ 'p.1': [{ who: 'other', stroke: theirs }] });
    expect(svg.querySelectorAll('path')).toHaveLength(2);
    svg.dispatchEvent(new MouseEvent('pointerup', { clientX: 132, clientY: 66, bubbles: true, button: 0 }));
  });

  it('外すと相手の線の知らせを受けるのをやめる', async () => {
    const { setPeers, share } = fakeShare();
    ink = attachBookInk(document, fits, ['p.1', 'p.2'], { store: memoryStore(), labels: LABELS, share });
    await vi.runAllTimersAsync();
    const svg = svgOf(fits[1]!);
    ink.destroy();
    ink = null;
    setPeers({ 'p.2': [{ who: 'other', stroke: theirs }] });
    expect(svg.querySelectorAll('path')).toHaveLength(0);
  });
});
