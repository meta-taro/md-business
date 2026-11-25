/**
 * 本モードのページへペンで書き込む。
 *
 * 線はページの入れ物（`.mdb-sheet-fit`）の中に SVG を重ねて描く。入れ物は組み幅で組んだまま
 * 縮めているだけなので、線もいっしょに縮み、窓の大きさを変えても本文と同じ所に付いたまま。
 * 座標は組み幅を 1 とした値で持ち、描くときだけ px（組み幅）へ戻す。
 *
 * 書いた線は文書の外へ保存する（store）。本文の Markdown には混ぜない。
 *
 * 共有（share）を渡すと、書いている途中の線を相手へ流し、相手の線を自分の線の下に重ねて描く。
 * 相手の線は会議中だけのもので、保存しない。
 */
import type { InkSender, PeerStroke } from '../presence/inkShare';
import { SHEET_BASE_WIDTH } from './bookSheets';
import {
  addPoint,
  emptyInk,
  eraseAt,
  parseInk,
  serializeInk,
  sheetKey,
  type InkData,
  type InkStroke,
  type InkTool,
} from './inkModel';

export interface InkStore {
  /** 保存してあった線。まだ無ければ null。 */
  load(): Promise<string | null>;
  save(json: string): Promise<void>;
}

export interface InkLabels {
  pen: string;
  highlighter: string;
  eraser: string;
}

export interface InkShare {
  sender: InkSender;
  /** そのページにある相手の線。 */
  peerStrokes(sheet: string): PeerStroke[];
  /** 相手の線が変わったら知らせる。戻り値でやめる。 */
  onChange(listener: () => void): () => void;
}

export interface BookInkOptions {
  store: InkStore;
  labels: InkLabels;
  share?: InkShare;
}

export interface BookInk {
  /** 道具を持っているか（持っている間は、押してもめくらない）。 */
  active(): boolean;
  /** 待っている保存をすぐ済ませる。 */
  flush(): Promise<void>;
  /** 面と道具を外す。書きかけは保存する。 */
  destroy(): void;
}

/** 書くたびに保存すると、1 本の線で何十回も書き込む。手が止まってから 1 回だけ保存する。 */
export const INK_SAVE_DELAY_MS = 800;

const SVG_NS = 'http://www.w3.org/2000/svg';
const SVG_CLASS = 'mdb-ink';
const BAR_CLASS = 'mdb-ink-bar';
const INKING_CLASS = 'mdb-inking';
const COLORS = ['#222222', '#d33333', '#1a6fd8', '#f5c400'] as const;
/** 太さ（組み幅を 1 とした値）。640px の組み幅でペンは約 2.5px、蛍光ペンは約 16px。 */
const WIDTH: Record<InkTool, number> = { pen: 0.004, highlighter: 0.025 };
/** これより近い点は足さない（線を軽くする）。 */
const MIN_DIST = 0.002;
const ERASER_RADIUS = 0.015;

type Tool = InkTool | 'eraser';

/** 道具の絵（24 四方の線画）。文字にしないのは、4 言語のどれでも幅が変わらないようにするため。 */
const ICONS: Record<Tool, string> = {
  pen: 'M4 20l4-1 11-11-3-3L5 16l-1 4zM14 7l3 3',
  highlighter: 'M5 21h8M9 17l-3-3 9-9 3 3-9 9zM6 14l-2 3h5',
  eraser: 'M8 20h12M5 15l9-9 5 5-7 7H9l-4-3zM10 10l5 5',
};

function icon(doc: Document, tool: Tool): SVGSVGElement {
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path = doc.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', ICONS[tool]);
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '1.8');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(path);
  return svg;
}

/** ページの鍵。原本の番号が重なるページは、後のほうを通し番号で持つ（線が混ざらないように）。 */
function sheetKeys(labels: readonly string[]): string[] {
  const used = new Set<string>();
  return labels.map((label, index) => {
    let key = sheetKey(label, index);
    if (used.has(key)) key = `#${index + 1}`;
    used.add(key);
    return key;
  });
}

function pathData(points: readonly number[]): string {
  const px = points.map((n) => n * SHEET_BASE_WIDTH);
  // 1 点だけでも丸い端で点として見えるよう、同じ点へ線を引く。
  const parts = [`M${px[0]} ${px[1]}`];
  for (let i = 2; i + 1 < px.length; i += 2) parts.push(`L${px[i]} ${px[i + 1]}`);
  if (px.length === 2) parts.push(`L${px[0]} ${px[1]}`);
  return parts.join(' ');
}

export function attachBookInk(
  doc: Document,
  fits: readonly HTMLElement[],
  labels: readonly string[],
  options: BookInkOptions
): BookInk {
  const root = doc.documentElement;
  const keys = sheetKeys(labels);
  let data: InkData = emptyInk();
  // 読めないうちに書くと、保存のときに前の線を上書きして消してしまう。読めるまでは書かせない。
  let ready = false;
  let destroyed = false;
  let tool: Tool | null = null;
  let color: string = COLORS[0];
  let timer: ReturnType<typeof setTimeout> | null = null;
  let dirty = false;
  const share = options.share;
  // 送った自分の線の id。保存してあった線は送っていないので持たない。
  const strokeIds = new WeakMap<InkStroke, string>();
  const idPrefix = Math.random().toString(36).slice(2, 10);
  let idCount = 0;
  const nextId = (): string => `${idPrefix}-${++idCount}`;
  // ページごとの書きかけの線。描き直しても消さないよう覚えておく。
  const lives: (SVGPathElement | null)[] = fits.map(() => null);

  function makePath(stroke: InkStroke, peer = false): SVGPathElement {
    const path = doc.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', pathData(stroke.points));
    path.setAttribute('stroke', stroke.color);
    path.setAttribute('stroke-width', String(stroke.width * SHEET_BASE_WIDTH));
    path.setAttribute('class', peer ? `mdb-ink-${stroke.tool} mdb-ink-peer` : `mdb-ink-${stroke.tool}`);
    return path;
  }

  const svgs = fits.map((fit, index) => {
    const svg = doc.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', SVG_CLASS);
    svg.setAttribute('aria-hidden', 'true');
    fit.appendChild(svg);
    bindDrawing(svg, fit, index);
    return svg;
  });

  function render(index: number): void {
    const svg = svgs[index]!;
    const key = keys[index]!;
    const peers = share ? share.peerStrokes(key).map((p) => makePath(p.stroke, true)) : [];
    const own = (data.sheets[key] ?? []).map((stroke) => makePath(stroke));
    const live = lives[index];
    svg.replaceChildren(...peers, ...own, ...(live ? [live] : []));
  }

  function scheduleSave(): void {
    dirty = true;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void flush();
    }, INK_SAVE_DELAY_MS);
  }

  function flush(): Promise<void> {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (!dirty) return Promise.resolve();
    dirty = false;
    return options.store.save(serializeInk(data)).catch(() => {
      // 保存に失敗した分は次に書いたときにまとめて保存し直す。
      dirty = true;
    });
  }

  function bindDrawing(svg: SVGSVGElement, fit: HTMLElement, index: number): void {
    let points: number[] | null = null;
    let live: SVGPathElement | null = null;
    let id: string | null = null;

    function sendLive(): void {
      if (!share || id === null || points === null || !tool || tool === 'eraser') return;
      share.sender.update(id, keys[index]!, { tool, color, width: WIDTH[tool], points });
    }

    // 見た目の位置から、組み幅を 1 とした座標へ戻す。縦も横と同じ単位にする（縦横比を保つ）。
    function toInk(e: MouseEvent): [number, number] | null {
      const rect = fit.getBoundingClientRect();
      if (rect.width <= 0) return null;
      return [(e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.width];
    }

    function erase(e: MouseEvent): void {
      const p = toInk(e);
      if (!p) return;
      const key = keys[index]!;
      const before = data.sheets[key] ?? [];
      const after = eraseAt(before, p[0], p[1], ERASER_RADIUS);
      if (after === before) return;
      if (share) {
        const kept = new Set(after);
        for (const stroke of before) {
          const id = strokeIds.get(stroke);
          if (id !== undefined && !kept.has(stroke)) share.sender.remove(id);
        }
      }
      data.sheets[key] = after;
      render(index);
      scheduleSave();
    }

    function onDown(e: MouseEvent): void {
      if (!tool || !ready || e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      (svg as Element & { setPointerCapture?: (id: number) => void }).setPointerCapture?.(
        (e as PointerEvent).pointerId
      );
      if (tool === 'eraser') {
        points = [];
        erase(e);
        return;
      }
      const p = toInk(e);
      if (!p) return;
      points = [p[0], p[1]];
      live = makePath({ tool, color, width: WIDTH[tool], points });
      lives[index] = live;
      svg.appendChild(live);
      id = nextId();
      sendLive();
    }

    function onMove(e: MouseEvent): void {
      if (points === null) return;
      e.preventDefault();
      if (tool === 'eraser') {
        erase(e);
        return;
      }
      const p = toInk(e);
      if (!p || !live) return;
      const next = addPoint(points, p[0], p[1], MIN_DIST);
      if (next === points) return;
      points = next;
      live.setAttribute('d', pathData(points));
      sendLive();
    }

    function onUp(e: MouseEvent): void {
      if (points === null) return;
      e.stopPropagation();
      if (live && tool && tool !== 'eraser') {
        const key = keys[index]!;
        const stroke: InkStroke = { tool, color, width: WIDTH[tool], points };
        sendLive();
        if (id !== null) strokeIds.set(stroke, id);
        data.sheets[key] = [...(data.sheets[key] ?? []), stroke];
        scheduleSave();
      }
      points = null;
      live = null;
      id = null;
      lives[index] = null;
    }

    // 書いている間の click が本モードまで届くと、ページがめくれてしまう。
    function onClick(e: MouseEvent): void {
      if (tool) e.stopPropagation();
    }

    svg.addEventListener('pointerdown', onDown);
    svg.addEventListener('pointermove', onMove);
    svg.addEventListener('pointerup', onUp);
    svg.addEventListener('pointercancel', onUp);
    svg.addEventListener('click', onClick);
  }

  // 道具バー。同じ道具をもう一度押すと手放す（普通にめくれる状態へ戻る）。
  const bar = doc.createElement('div');
  bar.className = BAR_CLASS;
  const toolButtons = new Map<Tool, HTMLButtonElement>();
  const colorButtons: HTMLButtonElement[] = [];

  function syncBar(): void {
    for (const [name, button] of toolButtons) {
      button.setAttribute('aria-pressed', String(tool === name));
    }
    for (const button of colorButtons) {
      button.setAttribute('aria-pressed', String(button.dataset.color === color));
    }
    root.classList.toggle(INKING_CLASS, tool !== null);
  }

  for (const name of ['pen', 'highlighter', 'eraser'] as const) {
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = `mdb-ink-tool mdb-ink-tool-${name}`;
    button.title = options.labels[name];
    button.setAttribute('aria-label', options.labels[name]);
    button.appendChild(icon(doc, name));
    button.addEventListener('click', () => {
      tool = tool === name ? null : name;
      syncBar();
    });
    toolButtons.set(name, button);
    bar.appendChild(button);
  }
  for (const value of COLORS) {
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'mdb-ink-color';
    button.dataset.color = value;
    button.style.setProperty('--ink-color', value);
    button.setAttribute('aria-label', value);
    button.addEventListener('click', () => {
      color = value;
      // 色を選んだのに消しゴムや手ぶらのままだと、選んだ意味が無い。ペンを持たせる。
      if (tool === null || tool === 'eraser') tool = 'pen';
      syncBar();
    });
    colorButtons.push(button);
    bar.appendChild(button);
  }
  root.appendChild(bar);
  syncBar();

  options.store.load().then(
    (text) => {
      if (destroyed) return;
      data = text ? parseInk(text) : emptyInk();
      ready = true;
      fits.forEach((_, index) => render(index));
    },
    () => {
      // 読めなかったときは書かせない（保存で前の線を消さないため）。
    }
  );

  const stopShare = share?.onChange(() => {
    if (!destroyed) fits.forEach((_, index) => render(index));
  });

  return {
    active: () => tool !== null,
    flush,
    destroy(): void {
      if (destroyed) return;
      void flush();
      destroyed = true;
      stopShare?.();
      for (const svg of svgs) svg.remove();
      bar.remove();
      root.classList.remove(INKING_CLASS);
    },
  };
}
