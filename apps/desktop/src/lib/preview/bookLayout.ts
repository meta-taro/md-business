/**
 * 本のように読む画面（見開き）の割り付けを決める純関数。
 *
 * ページは CSS の段組みで作る（1 段 = 1 ページ）。段の幅は窓の大きさから決まるので、
 * ページ番号は窓を変えるたびに変わる。ここで決めるのは「何ページ並べるか」
 * 「何ページあるか」「どこへめくるか」だけで、DOM には触らない。
 */

/** 見開きにするのに要る窓の幅（CSS px）。これより狭いと 1 ページずつ。 */
export const BOOK_SPREAD_MIN_WIDTH = 900;
/** 見開きにするのに要る横長さ（幅 ÷ 高さ）。正方形に近い窓で 2 段にすると 1 段が細すぎる。 */
export const BOOK_SPREAD_MIN_RATIO = 1.15;

export type PagesPerView = 1 | 2;

export interface BookMetrics {
  /** 1 画面に並べるページ数。 */
  perView: PagesPerView;
  /** 左右の余白（CSS px）。 */
  padX: number;
  /** ページとページの間（CSS px）。見開きの綴じ目にあたる。 */
  gap: number;
  /** 1 ページの幅（CSS px）。 */
  pageWidth: number;
  /** 1 ページ送るときに動かす量（CSS px）。ページ幅 + 間。 */
  stride: number;
}

export function pagesPerView(width: number, height: number): PagesPerView {
  if (width < BOOK_SPREAD_MIN_WIDTH || height <= 0) return 1;
  return width / height >= BOOK_SPREAD_MIN_RATIO ? 2 : 1;
}

/**
 * 窓の大きさから段の幅と送り量を決める。
 *
 * 送り量は「段の幅 + 間」をそのまま使う。こうすると、何画面めくっても
 * 1 ページ目の左端が常に左の余白の位置に来る（めくるたびに少しずつずれない）。
 */
export function bookMetrics(width: number, height: number): BookMetrics {
  const perView = pagesPerView(width, height);
  const padX = width < 600 ? 20 : 48;
  const gap = padX * 2;
  const content = Math.max(0, width - padX * 2);
  const pageWidth = Math.max(1, (content - gap * (perView - 1)) / perView);
  return { perView, padX, gap, pageWidth, stride: pageWidth + gap };
}

/**
 * 段組みにした本文の横幅（scrollWidth）から総ページ数を出す。
 *
 * scrollWidth は「左の余白 + 段 × n + 間 × (n - 1)」で、ブラウザによっては右の余白も含む。
 * 右の余白は送り量の半分に満たないので、四捨五入すればどちらでも同じ数になる。
 */
export function pageCount(scrollWidth: number, metrics: BookMetrics): number {
  const raw = (scrollWidth - metrics.padX + metrics.gap) / metrics.stride;
  return Math.max(1, Math.round(raw));
}

/**
 * 表示する先頭ページを、並べる数の倍数に揃えて範囲に収める。
 *
 * 見開きでは常に (0,1) (2,3) … の組で見せる。窓を広げて 1 ページから 2 ページに
 * 変わったときも、読んでいたページを含む組へ寄せる。
 */
export function alignPage(
  page: number,
  perView: PagesPerView,
  total: number
): number {
  const lastStart = Math.floor(Math.max(0, total - 1) / perView) * perView;
  const clamped = Math.min(Math.max(0, Math.floor(page)), lastStart);
  return clamped - (clamped % perView);
}

/** delta 画面ぶんめくった先の先頭ページ（端では止まる）。 */
export function turnPage(
  page: number,
  delta: number,
  perView: PagesPerView,
  total: number
): number {
  return alignPage(
    alignPage(page, perView, total) + delta * perView,
    perView,
    total
  );
}

/** ページ表示（「3–4 / 12」）。見開きで右側が無い最後の画面は 1 つだけ出す。 */
export function pageLabel(
  page: number,
  perView: PagesPerView,
  total: number
): string {
  const first = page + 1;
  const last = Math.min(page + perView, total);
  return first === last ? `${first} / ${total}` : `${first}–${last} / ${total}`;
}
