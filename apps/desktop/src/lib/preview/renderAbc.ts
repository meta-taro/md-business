/**
 * 楽譜（ABC 記法）の囲みを SVG にする。
 *
 * 構成図と同じく**本文の段階**で差し替える（`abcBlocks`）。プレビュー・PDF・HTML 書き出し・
 * 画像書き出し・サイト書き出しが同じ本文を通るので、描画の口はここ 1 つで足りる。
 *
 * abcjs は小さくないので、楽譜を持たない文書で費用が出ないよう、囲みの有無を先に見てから
 * ここが呼ばれる。読み込みも初めて要ったときに行う。
 */
import { sanitizeViewerHtml } from './sanitizeHtml';
import type { PreviewTheme } from './previewDocument';

/** 譜面 1 つを SVG 文字列にする関数。既定は abcjs（テストでは差し替える）。 */
export type AbcDraw = (source: string, options: { theme: PreviewTheme }) => Promise<string>;

// 書き出した SVG は CSS 変数を使えないので、線と音符の色はここで決める。
const INK: Record<PreviewTheme, string> = { light: '#1f2328', dark: '#e6edf3' };

const cache = new Map<string, string>();
const CACHE_LIMIT = 50;

let abcPromise: Promise<typeof import('abcjs')> | null = null;

async function defaultDraw(source: string, options: { theme: PreviewTheme }): Promise<string> {
  if (!abcPromise) abcPromise = import('abcjs');
  const abcjs = await abcPromise;
  const abc = (abcjs as { default?: typeof abcjs }).default ?? abcjs;

  // abcjs は文字の幅を測りながら組むので、文書に繋がった要素が要る。画面の外に置いて描き、
  // 出来た SVG だけを持ち帰る。
  const host = document.createElement('div');
  host.style.cssText = 'position:absolute;left:-10000px;top:0;width:800px;visibility:hidden;';
  document.body.appendChild(host);
  try {
    const tunes = abc.renderAbc(host, source, { foregroundColor: INK[options.theme] });
    const svg = host.querySelector('svg');
    // ABC は寛容で、ただの文字でも何かしら描こうとする。段が 1 つも組めなかったときだけ失敗にする。
    if (svg === null || (tunes[0]?.lines.length ?? 0) === 0) {
      throw new Error(firstWarning(tunes[0]?.warnings) ?? 'no notes');
    }
    return asStandaloneSvg(svg, INK[options.theme]);
  } finally {
    host.remove();
  }
}

/** abcjs の警告は HTML で印を付けてくる。理由として出すので文字だけにする。 */
function firstWarning(warnings: string[] | undefined): string | undefined {
  const first = warnings?.[0];
  return first === undefined ? undefined : first.replace(/<[^>]*>/g, '');
}

/**
 * 画面に挿す前提の SVG を、それだけで開ける画像にする。
 *
 * HTML の中で組んだ SVG は名前空間を持たず、大きさも width/height だけで書かれる。
 * data URL の画像は名前空間が無いと描かれず、viewBox が無いと縮めたときに切れる。
 * 色も currentColor のままでは周りから受け継げない。
 */
function asStandaloneSvg(svg: SVGSVGElement, ink: string): string {
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  // 画像として開くと周りの文字色を受け継がないので、currentColor は黒になる。色を書き込む。
  svg.setAttribute('fill', ink);
  svg.setAttribute('stroke', ink);
  const width = svg.getAttribute('width');
  const height = svg.getAttribute('height');
  if (!svg.hasAttribute('viewBox') && width !== null && height !== null) {
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  }
  return svg.outerHTML;
}

function remember(key: string, svg: string): void {
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, svg);
}

/**
 * 譜面 1 つを、本文に載せられる形（無害化済みの SVG）にする。
 *
 * 描けなかったときは投げる。理由の出し方は呼ぶ側が決める。
 * 失敗を覚えないのは、書き手が直したあとも同じ理由が出続けないようにするため。
 */
export async function renderAbcSvg(
  source: string,
  theme: PreviewTheme,
  draw: AbcDraw = defaultDraw,
): Promise<string> {
  const key = `${theme}\n${source}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  const svg = sanitizeViewerHtml(await draw(source, { theme }), { allowSvg: true });
  remember(key, svg);
  return svg;
}

/** テスト間で対応表を空にする。製品コードからは呼ばない。 */
export function _resetAbcCacheForTest(): void {
  cache.clear();
}
