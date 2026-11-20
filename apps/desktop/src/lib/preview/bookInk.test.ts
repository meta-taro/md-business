// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { attachBookInk, INK_SAVE_DELAY_MS, type BookInk, type InkStore } from './bookInk';
import { SHEET_BASE_WIDTH } from './bookSheets';
import { parseInk } from './inkModel';

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
