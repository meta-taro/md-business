/**
 * 本のように読む画面（見開き）を、プレビューの iframe の中へ取り付ける。
 *
 * 親（アプリ）の側から `contentDocument` を操作する。iframe の中へスクリプトを
 * 文字列で差し込む形にしないのは、割り付けの計算（bookLayout）をそのまま使い回し、
 * テストで固めた関数と画面で動く関数を同じものにするため。
 *
 * 段組みの決まりそのものは buildPreviewDocument が入れてある（`html.mdb-book` のときだけ効く）。
 * ここでするのは、class を付ける・寸法を変数に入れる・めくる操作を受けることだけ。
 *
 * 本文に原本のページの区切り（`<div class="page">p.19</div>`）があるときは、段組みで流さず、
 * 区切りごとに 1 ページの入れ物へ収める（はみ出す分は縮める）。外すときは元の並びへ戻す。
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
import { findPage, fitScale, sheetLabel } from './bookSheets';

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
  /** 開いたときに出す、めくり方の案内。一度めくれば消す。 */
  hint?: string;
}

export interface BookReader {
  /** 窓・倍率・中身が変わったあとに割り直す。読んでいた所はおおよそ保つ。 */
  refresh(zoom?: number): void;
  /** delta 画面ぶんめくる（負なら戻る）。 */
  turn(delta: number): void;
  /** その要素が載っているページを開く（検索で飛ぶとき）。 */
  showElement(el: Element): void;
  /** 「p.19」「19」などで指したページを開く。見つからなければ動かさずに false。 */
  goTo(query: string): boolean;
  state(): BookPageState;
  /** 取り付けたものを全部外し、縦に流れる元の画面へ戻す。 */
  destroy(): void;
}

export const BOOK_CLASS = 'mdb-book';
const PAGE_LABEL_CLASS = 'mdb-book-page';
const HINT_CLASS = 'mdb-book-hint';
const JUMP_CLASS = 'mdb-book-jump';
const SHEETS_CLASS = 'mdb-sheets';
const SHEET_CLASS = 'mdb-sheet';
const SHEET_FIT_CLASS = 'mdb-sheet-fit';
/** 原本のページの区切り。本文の直下に置かれたものだけを見る（表の中などに紛れたものは区切りにしない）。 */
const PAGE_MARKER = ':scope > div.page';
const VARS = [
  '--sheet-width',
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

  const label = doc.createElement('button');
  label.type = 'button';
  label.className = PAGE_LABEL_CLASS;
  label.setAttribute('aria-live', 'polite');
  label.addEventListener('click', openJump);

  // ページ表示を押すと番号を打てる。原本の番号で開ければ、紙と並べて読める。
  const jump = doc.createElement('input');
  jump.type = 'text';
  jump.className = JUMP_CLASS;
  jump.hidden = true;
  jump.setAttribute('aria-label', 'go to page');
  jump.addEventListener('keydown', onJumpKeydown);
  jump.addEventListener('blur', closeJump);

  const sheets = buildSheets(doc);
  const labels = sheets.map(
    (sheet) =>
      sheet.firstElementChild?.querySelector(PAGE_MARKER)?.textContent?.trim() ?? ''
  );

  // 段組みは横へ続いていても、画面には 1 画面ぶんしか見えない。めくれることを端の矢印で示す。
  function arrow(className: string, delta: number): HTMLButtonElement {
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = className;
    button.setAttribute(
      'aria-label',
      delta < 0 ? 'previous page' : 'next page'
    );
    button.addEventListener('click', () => turn(delta));
    return button;
  }
  const prevArrow = arrow('mdb-book-prev', -1);
  const nextArrow = arrow('mdb-book-next', 1);
  let hint: HTMLElement | null = null;

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
    if (sheets.length === 0) {
      total = pageCount(body.scrollWidth, metrics);
      return;
    }
    root.style.setProperty('--sheet-width', `${metrics.pageWidth}px`);
    total = sheets.length;
    fitSheets();
  }

  function fitSheets(): void {
    // 測るのは縮めていない形で。縮めた幅のまま測ると、折り返しが変わって高さを読み違える。
    for (const sheet of sheets) {
      const fit = sheet.firstElementChild as HTMLElement;
      fit.style.setProperty('--sheet-scale', '1');
    }
    for (const sheet of sheets) {
      const fit = sheet.firstElementChild as HTMLElement;
      const scale = fitScale(fit.scrollHeight, sheet.clientHeight);
      fit.style.setProperty('--sheet-scale', String(scale));
    }
  }

  function show(next: number): void {
    page = alignPage(next, metrics.perView, total);
    root.style.setProperty('--book-shift', String(page * metrics.stride));
    label.textContent =
      sheets.length > 0
        ? sheetLabel(page, metrics.perView, labels)
        : pageLabel(page, metrics.perView, total);
    prevArrow.hidden = page === 0;
    nextArrow.hidden = page + metrics.perView >= total;
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
    hint?.remove();
    hint = null;
    show(turnPage(page, delta, metrics.perView, total));
  }

  function showElement(el: Element): void {
    if (sheets.length > 0) {
      const sheet = el.closest(`.${SHEET_CLASS}`);
      const index = sheets.indexOf(sheet as HTMLElement);
      if (index >= 0) show(index);
      return;
    }
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

  function goTo(query: string): boolean {
    const index = findPage(query, labels, total);
    if (index === null) return false;
    hint?.remove();
    hint = null;
    show(index);
    return true;
  }

  function openJump(): void {
    jump.hidden = false;
    jump.value = '';
    jump.removeAttribute('aria-invalid');
    jump.focus();
  }

  function closeJump(): void {
    jump.hidden = true;
  }

  function onJumpKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeJump();
      return;
    }
    if (e.key !== 'Enter') return;
    e.preventDefault();
    // 無い番号では閉じない。閉じると、打ち間違えたのか開いたのかが見分けられない。
    if (goTo(jump.value)) closeJump();
    else jump.setAttribute('aria-invalid', 'true');
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
  if (sheets.length > 0) root.classList.add(SHEETS_CLASS);
  root.appendChild(label);
  root.appendChild(jump);
  root.appendChild(prevArrow);
  root.appendChild(nextArrow);
  win.addEventListener('keydown', onKeydown);
  win.addEventListener('wheel', onWheel, { passive: false });
  win.addEventListener('pointerdown', onPointerDown);
  win.addEventListener('pointerup', onPointerUp);
  win.addEventListener('click', onClick);
  win.addEventListener('resize', scheduleRefresh);
  doc.addEventListener('load', onLoad, true);

  measure();
  show(options.initialPage ?? 0);
  if (options.hint && total > metrics.perView) {
    hint = doc.createElement('div');
    hint.className = HINT_CLASS;
    hint.textContent = options.hint;
    root.appendChild(hint);
  }

  return {
    refresh,
    turn,
    showElement,
    goTo,
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
      root.classList.remove(SHEETS_CLASS);
      unwrapSheets(sheets);
      for (const name of VARS) root.style.removeProperty(name);
      label.remove();
      jump.remove();
      prevArrow.remove();
      nextArrow.remove();
      hint?.remove();
    },
  };
}

/**
 * 本文を原本のページの区切りごとに入れ物（`.mdb-sheet > .mdb-sheet-fit`）へ移す。
 * 区切りが無ければ何もせず空を返す（段組みで読む）。
 * 最初の区切りより前（書名など）は 1 ページ目に含める。それだけで 1 ページにすると、
 * 原本の番号と並びがずれる。
 */
function buildSheets(doc: Document): HTMLElement[] {
  const body = doc.body;
  if (body.querySelector(PAGE_MARKER) === null) return [];
  const sheets: HTMLElement[] = [];
  let fit: HTMLElement | null = null;
  let fitHasMarker = false;
  for (const node of Array.from(body.childNodes)) {
    const isMarker = node instanceof doc.defaultView!.Element && node.matches('div.page');
    if (fit === null || (isMarker && fitHasMarker)) {
      const sheet = doc.createElement('div');
      sheet.className = SHEET_CLASS;
      fit = doc.createElement('div');
      fit.className = SHEET_FIT_CLASS;
      sheet.appendChild(fit);
      body.insertBefore(sheet, node);
      sheets.push(sheet);
      fitHasMarker = false;
    }
    fit.appendChild(node);
    if (isMarker) fitHasMarker = true;
  }
  return sheets;
}

/** 入れ物を外し、中身を元の位置へ戻す。 */
function unwrapSheets(sheets: readonly HTMLElement[]): void {
  for (const sheet of sheets) {
    const fit = sheet.firstElementChild as HTMLElement;
    while (fit.firstChild) sheet.before(fit.firstChild);
    sheet.remove();
  }
}
