/**
 * On-demand Mermaid diagram renderer (subset build).
 *
 * mermaid 11.x を MV3 CSP (`script-src 'self'`) 下で使うため、
 * vite.config.ts で cytoscape / cytoscape-cose-bilkent / cytoscape-fcose を
 * 空 shim に alias している。これにより architecture / mindmap 図は描画
 * できないが、ER / flowchart / sequence は dagre 系レイアウトで動作する。
 *
 * mermaid 本体（≈200 KB gzip）は初期 viewer bundle に載せたくないので、
 * Markdown 中に `<pre><code class="language-mermaid">` ブロックが
 * 含まれているときだけ dynamic import で読み込む。請求書フローでは
 * import されず、bundle サイズも実行コストもゼロ。
 *
 * 両 preview iframe と print-flow 用 iframe の HTML 注入前にここを通すので、
 * ユーザーは描画済み diagram を見て、PDF にも inline SVG として残る
 * （ベクター + テキスト検索可能）。
 */

let mermaidPromise: Promise<typeof import('mermaid').default> | null = null;

/**
 * Lazy-load `mermaid` exactly once and reuse the same module instance for
 * subsequent renders within the viewer's lifetime. Initialized with
 * `securityLevel: 'strict'` so user-authored diagrams cannot execute scripts
 * or break out of the SVG sandbox.
 */
async function getMermaid(): Promise<typeof import('mermaid').default> {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then(({ default: mermaid }) => {
      mermaid.initialize({
        startOnLoad: false,
        theme: 'default',
        securityLevel: 'strict',
        fontFamily: 'Noto Sans JP, Hiragino Sans, Yu Gothic, Meiryo, system-ui, sans-serif',
      });
      return mermaid;
    });
  }
  return mermaidPromise;
}

const MERMAID_BLOCK_SELECTOR = 'pre > code.language-mermaid';

/**
 * Walk `html`, find every Mermaid code block, render each to inline SVG via
 * the dynamically-imported `mermaid` package, and return the rewritten HTML.
 *
 * On render failure the original `<pre><code>` block is left intact so the
 * user can still see the source — Mermaid syntax errors should not blank out
 * the surrounding document.
 *
 * If no Mermaid blocks are present, returns `html` synchronously without
 * touching the dynamic import — keeping the invoice flow zero-cost.
 */
export async function renderMermaidInHtml(html: string): Promise<string> {
  if (typeof document === 'undefined') return html;
  // Cheap pre-check: no class marker → no mermaid import, no DOM parsing.
  if (!html.includes('class="language-mermaid"')) return html;

  const container = document.createElement('div');
  container.innerHTML = html;
  const codeBlocks = container.querySelectorAll<HTMLElement>(MERMAID_BLOCK_SELECTOR);
  if (codeBlocks.length === 0) return html;

  const mermaid = await getMermaid();

  let index = 0;
  for (const code of Array.from(codeBlocks)) {
    const pre = code.parentElement;
    if (!pre) continue;
    const source = code.textContent ?? '';
    index += 1;
    const id = `mdb-mermaid-${index}`;
    try {
      const { svg } = await mermaid.render(id, source);
      const wrapper = document.createElement('div');
      wrapper.className = 'mdb-mermaid';
      wrapper.innerHTML = svg;
      pre.replaceWith(wrapper);
    } catch (err: unknown) {
      // Leave the source visible and annotate the failure so the author can
      // recover from a typo without losing the rest of the document.
      const note = document.createElement('div');
      note.className = 'mdb-mermaid mdb-mermaid--error';
      const reason = err instanceof Error ? err.message : String(err);
      note.textContent = `Mermaid 描画に失敗しました: ${reason}`;
      pre.before(note);
    }
  }

  return container.innerHTML;
}
