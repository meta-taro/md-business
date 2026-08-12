/**
 * プレビュー内の図（Mermaid）を SVG に描き替える。
 *
 * プレビューは iframe の中身ごと作り直す作りなので、描画は「作り直しの直後に
 * 中身を書き換える」形で入れる。本文の組み立て（renderPreview）は同期のままに
 * したいが、図の描画は本質的に非同期（Mermaid 本体を必要になってから読む）ため、
 * この 2 つを混ぜない。
 *
 * Mermaid 本体は大きい（数百 KB）。図が 1 つも無い文書では読み込まない。
 * 請求書のように図を使わない文書で費用が出ないことが遅延読み込みの前提なので、
 * 印の有無を先に見てから import する。
 *
 * 描画そのものは親ウィンドウ側で行い、出来上がった SVG だけを iframe へ運ぶ。
 * Mermaid は文字幅を測るために本物の描画環境を要求するが、iframe は同一生成元
 * なので SVG の受け渡しに制約は無い。
 */
import { sanitizeViewerHtml } from './sanitizeHtml';
import type { PreviewTheme } from './previewDocument';
// 設定の形だけを借りる型の取り込み。実体は描画のときまで読み込まない。
import type { MermaidConfig } from 'mermaid';

/** 図 1 つを SVG 文字列にする関数。既定は Mermaid 本体（テストでは差し替える）。 */
export type MermaidRenderer = (source: string, theme: PreviewTheme) => Promise<string>;

export interface RenderMermaidOptions {
  theme?: PreviewTheme;
  renderer?: MermaidRenderer;
}

const BLOCK_SELECTOR = 'pre > code.language-mermaid';
const STYLE_ID = 'mdb-mermaid-style';

// 図の元テキスト（＋テーマ）から SVG への対応表。プレビューは打鍵のたびに
// 作り直されるため、これが無いと図 1 つで毎回描画が走る。
const cache = new Map<string, string>();
const CACHE_LIMIT = 50;

let seq = 0;
let mermaidPromise: Promise<typeof import('mermaid').default> | null = null;

/**
 * 描画時の設定。
 *
 * `htmlLabels: false` が要点。Mermaid は既定で、ER 図・フローチャート・クラス図の
 * ラベルを `<foreignObject>`（SVG の中に HTML を埋める箱）で描く。プレビューの
 * 無害化はこの箱を落とすため、そのままだと枠だけ出て文字が消える
 * （シーケンス図だけ無事なのは、そちらが最初から `<text>` で描くため）。
 *
 * 直し方は 2 つあり、無害化側で箱を通すこともできるが、それは図のラベルを
 * 任意の HTML の入口にすることになる。図の側を `<text>` に寄せるほうを採った。
 */
export function mermaidConfig(theme: PreviewTheme): MermaidConfig {
  return {
    startOnLoad: false,
    theme: theme === 'dark' ? 'dark' : 'default',
    securityLevel: 'strict',
    fontFamily: 'Noto Sans JP, Hiragino Sans, Yu Gothic, Meiryo, system-ui, sans-serif',
    // 図の種類ごとに設定の読み先が違うため、全部そろえて指定する。
    htmlLabels: false,
    flowchart: { htmlLabels: false },
    class: { htmlLabels: false },
  };
}

async function defaultRenderer(source: string, theme: PreviewTheme): Promise<string> {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then((m) => m.default);
  }
  const mermaid = await mermaidPromise;
  // テーマは文書ごとに変わりうるので描画のたびに与える。initialize は設定の
  // 差し替えのみで、本体の読み直しは起きない。
  mermaid.initialize(mermaidConfig(theme));
  seq += 1;
  const { svg } = await mermaid.render(`mdb-mermaid-${seq}`, source);
  return svg;
}

function remember(key: string, svg: string): void {
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, svg);
}

/** 図の置き場所だけを整える。中身の見た目は Mermaid 側が SVG に持っている。 */
function ensureStyle(doc: Document): void {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = [
    '.mdb-mermaid { margin: 1em 0; text-align: center; }',
    '.mdb-mermaid svg { max-width: 100%; height: auto; }',
    // 図が紙の途中で割れると読めなくなる。PDF もこの文書をそのまま刷る。
    '@media print { .mdb-mermaid { break-inside: avoid; } }',
  ].join('\n');
  (doc.head ?? doc.documentElement).appendChild(style);
}

/**
 * `doc` の中の図をすべて SVG へ置き換える。描画に失敗した図は元のコードブロックを
 * そのまま残す（書きかけの図で本文全体が消えないように）。
 */
export async function renderMermaidInDocument(
  doc: Document,
  options: RenderMermaidOptions = {},
): Promise<void> {
  const blocks = Array.from(doc.querySelectorAll(BLOCK_SELECTOR));
  if (blocks.length === 0) return;

  const theme = options.theme ?? 'light';
  const render = options.renderer ?? defaultRenderer;
  ensureStyle(doc);

  for (const code of blocks) {
    const pre = code.parentElement;
    if (!pre) continue;
    const source = code.textContent ?? '';
    if (source.trim() === '') continue;

    const key = `${theme}\n${source}`;
    let svg = cache.get(key);
    if (svg === undefined) {
      try {
        svg = sanitizeViewerHtml(await render(source, theme), { allowSvg: true });
      } catch {
        // 構文エラーは書き手が直すもの。ここで文言を出すより、元の図の文字が
        // 見えているほうが直しやすい。
        continue;
      }
      remember(key, svg);
    }

    // 待っている間に文書が作り直されていることがある。そのときは書き込まない。
    if (!pre.isConnected) continue;
    const figure = doc.createElement('div');
    figure.className = 'mdb-mermaid';
    figure.innerHTML = svg;
    pre.replaceWith(figure);
  }
}

/** テスト間で対応表を空にする。製品コードからは呼ばない。 */
export function _resetMermaidCacheForTest(): void {
  cache.clear();
}
