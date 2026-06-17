import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import { splitFrontmatter } from './frontmatter.js';

/**
 * Render a Markdown source string to an HTML fragment, frontmatter-stripped.
 *
 * Used by viewers (chrome-extension, future PWA / VS Code / Google Doc add-on)
 * to turn a spec document's body into the printable HTML that the renderer-pdf
 * spec layout wraps. Kept in `@md-business/core` so every distribution channel
 * uses the same pipeline.
 *
 * Implementation notes:
 *   - The unified pipeline (remark-parse → remark-gfm → remark-rehype →
 *     rehype-stringify) is pure JS with no `eval` / `new Function()`, so it is
 *     MV3 CSP safe. `remark-gfm` adds GitHub Flavored Markdown — tables,
 *     strikethrough, task lists, autolinks — which the spec template relies on
 *     for 機能一覧 / 比較表 のような pipe table を描画するため必須。
 *   - `allowDangerousHtml: false` (the default) drops raw HTML embedded in
 *     the Markdown rather than passing it through. Authors who need inline
 *     SVG / Mermaid will get dedicated handling on a later pass — for now,
 *     anything that looks like HTML in the body is silently stripped.
 *   - The frontmatter is split off first via `splitFrontmatter`; if the caller
 *     already has a body-only string, pass `{ hasFrontmatter: false }`.
 */
export interface RenderMarkdownToHtmlOptions {
  /**
   * Whether the input contains a YAML frontmatter block to strip. Defaults to
   * `true` because callers usually pass the raw `.md` file contents.
   */
  hasFrontmatter?: boolean;
}

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype)
  .use(rehypeStringify);

export function renderMarkdownToHtml(src: string, options: RenderMarkdownToHtmlOptions = {}): string {
  const { hasFrontmatter = true } = options;
  const body = hasFrontmatter ? splitFrontmatter(src).body : src;
  const file = processor.processSync(body);
  return String(file);
}
