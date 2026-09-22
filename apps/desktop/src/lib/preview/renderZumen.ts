/**
 * 構成図（zumen）の囲みを SVG にする。
 *
 * 図（Mermaid）と違い、こちらは**本文の段階**で差し替える（`zumenBlocks.ts`）。
 * 出来上がった画面へ後から挿す形にすると、画面には出るのに書き出すと消える、が
 * 起きる。プレビュー・PDF・HTML 書き出し・画像書き出し・サイト書き出しが同じ本文を
 * 通るので、描画の口はここ 1 つで足りる。
 *
 * zumen 本体は配置の計算に elkjs を通すので小さくない。構成図を持たない文書で
 * 費用が出ないよう、`zumenBlocks.ts` が囲みの有無を先に見てからここを呼ぶ。
 */
import { sanitizeViewerHtml } from './sanitizeHtml';
import type { PreviewTheme } from './previewDocument';

/** 図 1 枚を SVG 文字列にする関数。既定は zumen 本体（テストでは差し替える）。 */
export type ZumenDraw = (source: string, options: { theme: PreviewTheme }) => Promise<string>;

// 図の元テキスト（＋テーマ）から SVG への対応表。プレビューは打鍵のたびに本文を
// 組み直すため、これが無いと図 1 つで毎回配置計算が走り、打つそばから待たされる。
const cache = new Map<string, string>();
const CACHE_LIMIT = 50;

let drawPromise: Promise<ZumenDraw> | null = null;

async function defaultDraw(source: string, options: { theme: PreviewTheme }): Promise<string> {
  if (!drawPromise) {
    drawPromise = import('@meta-taro/zumen').then((m) => m.toSvg);
  }
  return (await drawPromise)(source, options);
}

function remember(key: string, svg: string): void {
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, svg);
}

/**
 * 図 1 枚を、本文に載せられる形（無害化済みの SVG）にする。
 *
 * 描けなかったときは投げる。理由の出し方は呼ぶ側（`zumenBlocks.ts`）が決める。
 * 失敗を覚えないのは、書き手が直したあとも同じ理由が出続けないようにするため。
 */
export async function renderZumenSvg(
  source: string,
  theme: PreviewTheme,
  draw: ZumenDraw = defaultDraw,
): Promise<string> {
  const key = `${theme}\n${source}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  const svg = sanitizeViewerHtml(await draw(source, { theme }), { allowSvg: true });
  remember(key, svg);
  return svg;
}

/** テスト間で対応表を空にする。製品コードからは呼ばない。 */
export function _resetZumenCacheForTest(): void {
  cache.clear();
}
