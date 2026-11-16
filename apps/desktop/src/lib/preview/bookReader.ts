/**
 * 本のように読む画面（見開き）を、プレビューの iframe の中へ取り付ける。
 *
 * 親（アプリ）の側から `contentDocument` を操作する。iframe の中へスクリプトを
 * 文字列で差し込む形にしないのは、割り付けの計算（bookLayout）をそのまま使い回し、
 * テストで固めた関数と画面で動く関数を同じものにするため。
 *
 * 段組みの決まりそのものは buildPreviewDocument が入れてある（`html.mdb-book` のときだけ効く）。
 * ここでするのは、class を付ける・寸法を変数に入れる・めくる操作を受けることだけ。
 */
import {
  alignPage,
  bookMetrics,
  pageCount,
  pageLabel,
  turnPage,
  type BookMetrics,
  type PagesPerView,
} from './bookLayout';

export interface BookPageState {
  /** 表示している先頭ページ（0 始まり）。 */
  page: number;
  perView: PagesPerView;
  total: number;
}

export interface BookReaderOptions {
  /** 文書に掛かっている倍率（`--preview-zoom`）。 */
  zoom: number;
  /** 開いたときの先頭ページ。組み直し（srcdoc の更新）をまたいで読んでいた所へ戻すのに使う。 */
  initialPage?: number;
  /** ページが変わるたびに呼ぶ。 */
  onPage?: (state: BookPageState) => void;
}

export interface BookReader {
  /** 窓・倍率・中身が変わったあとに割り直す。読んでいた所はおおよそ保つ。 */
  refresh(zoom?: number): void;
  /** delta 画面ぶんめくる（負なら戻る）。 */
  turn(delta: number): void;
  /** その要素が載っているページを開く（検索で飛ぶとき）。 */
  showElement(el: Element): void;
  state(): BookPageState;
  /** 取り付けたものを全部外し、縦に流れる元の画面へ戻す。 */
  destroy(): void;
}

export const BOOK_CLASS = 'mdb-book';
const PAGE_LABEL_CLASS = 'mdb-book-page';
const VARS = [
  '--book-height',
  '--book-pad-y',
  '--book-pad-x',
  '--book-gap',
  '--book-columns',
  '--book-shift',
];
/** トラックパッドは 1 回のなぞりで細かい wheel を何十も出す。1 回 = 1 めくりにするための間。 */
const WHEEL_INTERVAL_MS = 350;
/** これより短い横の動きはめくりにしない（タップの揺れ）。 */
const SWIPE_MIN_PX = 50;

/** 押してもめくらない所。押した物そのものの役目を優先する。 */
const INTERACTIVE =
  'a, button, input, textarea, select, summary, details, label, [contenteditable]';

export function attachBookReader(
  doc: Document,
  options: BookReaderOptions
): BookReader {
  const win = doc.defaultView;
  if (!win) throw new Error('attachBookReader: document has no window');
  const root = doc.documentElement;
  const body = doc.body;

  let zoom = options.zoom > 0 ? options.zoom : 1;
  let metrics: BookMetrics = bookMetrics(1, 1);
  let total = 1;
  let page = 0;

  const label = doc.createElement('div');
  label.className = PAGE_LABEL_CLASS;
  label.setAttribute('aria-live', 'polite');

  function measure(): void {
    const width = win!.innerWidth / zoom;
    const height = win!.innerHeight / zoom;
    metrics = bookMetrics(width, height);
    const padY = height < 600 ? 20 : 32;
    root.style.setProperty('--book-height', `${height}px`);
    root.style.setProperty('--book-pad-y', `${padY}px`);
    root.style.setProperty('--book-pad-x', `${metrics.padX}px`);
    root.style.setProperty('--book-gap', `${metrics.gap}px`);
    root.style.setProperty('--book-columns', String(metrics.perView));
    total = pageCount(body.scrollWidth, metrics);
  }

  function show(next: number): void {
    page = alignPage(next, metrics.perView, total);
    root.style.setProperty('--book-shift', String(page * metrics.stride));
    label.textContent = pageLabel(page, metrics.perView, total);
    options.onPage?.({ page, perView: metrics.perView, total });
  }

  function refresh(nextZoom?: number): void {
    if (nextZoom !== undefined && nextZoom > 0) zoom = nextZoom;
    // ページ数は割り直すと変わる。番号ではなく「全体のどのあたりか」を保つ。
    const ratio = total > 1 ? page / (total - 1) : 0;
    measure();
    show(Math.round(ratio * (total - 1)));
  }

  function turn(delta: number): void {
    show(turnPage(page, delta, metrics.perView, total));
  }

  function showElement(el: Element): void {
    const rect = el.getBoundingClientRect();
    const bodyRect = body.getBoundingClientRect();
    if (bodyRect.width <= 0) return;
    // 画面上の位置は変形と倍率が掛かっている。body の見た目の幅と組版上の幅の比で戻す。
    const x = (rect.left - bodyRect.left) * (body.offsetWidth / bodyRect.width);
    const column = Math.floor(
      (x - metrics.padX + metrics.gap / 2) / metrics.stride
    );
    show(column);
  }

  function onKeydown(e: KeyboardEvent): void {
    if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
    const target = e.target as Element | null;
    if (target?.closest?.('input, textarea, select, [contenteditable]')) return;
    let delta = 0;
    if (
      e.key === 'ArrowRight' ||
      e.key === 'PageDown' ||
      (e.key === ' ' && !e.shiftKey)
    )
      delta = 1;
    else if (
      e.key === 'ArrowLeft' ||
      e.key === 'PageUp' ||
      (e.key === ' ' && e.shiftKey)
    )
      delta = -1;
    else if (e.key === 'Home') delta = -total;
    else if (e.key === 'End') delta = total;
    if (delta === 0) return;
    e.preventDefault();
    turn(delta);
  }

  let lastWheel = Number.NEGATIVE_INFINITY;
  function onWheel(e: WheelEvent): void {
    if (e.ctrlKey || e.metaKey) return;
    const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (d === 0) return;
    e.preventDefault();
    if (e.timeStamp - lastWheel < WHEEL_INTERVAL_MS) return;
    lastWheel = e.timeStamp;
    turn(d > 0 ? 1 : -1);
  }

  let swipeStartX: number | null = null;
  let swiped = false;
  function onPointerDown(e: PointerEvent): void {
    // マウスの横移動は文字の選択なので、めくりにしない。
    swipeStartX = e.pointerType === 'mouse' ? null : e.clientX;
  }
  function onPointerUp(e: PointerEvent): void {
    if (swipeStartX === null) return;
    const dx = e.clientX - swipeStartX;
    swipeStartX = null;
    if (Math.abs(dx) < SWIPE_MIN_PX) return;
    swiped = true;
    turn(dx < 0 ? 1 : -1);
  }

  function onClick(e: MouseEvent): void {
    if (swiped) {
      swiped = false;
      return;
    }
    if (e.defaultPrevented || e.button !== 0) return;
    const target = e.target as Element | null;
    if (target?.closest?.(INTERACTIVE)) return;
    // 文字を選び終えたときの click でめくると、選んだ所が画面から消える。
    const selection = win!.getSelection();
    if (selection && !selection.isCollapsed) return;
    turn(e.clientX < win!.innerWidth / 2 ? -1 : 1);
  }

  let frame = 0;
  function scheduleRefresh(): void {
    if (frame) return;
    const raf =
      win!.requestAnimationFrame?.bind(win) ??
      ((cb: () => void) => win!.setTimeout(cb, 16));
    frame = raf(() => {
      frame = 0;
      refresh();
    });
  }
  // 画像は読み込まれてから高さが決まり、ページ数が変わる。
  function onLoad(e: Event): void {
    if (e.target !== doc && e.target !== win) scheduleRefresh();
  }

  root.classList.add(BOOK_CLASS);
  root.appendChild(label);
  win.addEventListener('keydown', onKeydown);
  win.addEventListener('wheel', onWheel, { passive: false });
  win.addEventListener('pointerdown', onPointerDown);
  win.addEventListener('pointerup', onPointerUp);
  win.addEventListener('click', onClick);
  win.addEventListener('resize', scheduleRefresh);
  doc.addEventListener('load', onLoad, true);

  measure();
  show(options.initialPage ?? 0);

  return {
    refresh,
    turn,
    showElement,
    state: () => ({ page, perView: metrics.perView, total }),
    destroy() {
      win.removeEventListener('keydown', onKeydown);
      win.removeEventListener('wheel', onWheel);
      win.removeEventListener('pointerdown', onPointerDown);
      win.removeEventListener('pointerup', onPointerUp);
      win.removeEventListener('click', onClick);
      win.removeEventListener('resize', scheduleRefresh);
      doc.removeEventListener('load', onLoad, true);
      if (frame)
        (win.cancelAnimationFrame ?? win.clearTimeout).call(win, frame);
      root.classList.remove(BOOK_CLASS);
      for (const name of VARS) root.style.removeProperty(name);
      label.remove();
    },
  };
}
