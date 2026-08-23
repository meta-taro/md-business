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
  /**
   * 文書の言語。注釈の見出しに使う。知らない値と省略は日本語に落とす
   * （読めない見出しを出すより、既定の言語で出したほうが直しやすい）。
   */
  lang?: string;
}

/**
 * 末尾へまとめる注釈（脚注）の見出し。
 *
 * remark-gfm の既定は英語の `Footnotes` で、`sr-only` を当てて隠す前提になっている。
 * その class はどのスタイルシートにも無いので、隠れないまま日本語の請求書へ
 * `Footnotes` と刷られていた。隠すのではなく、文書の言語の見出しとして出す。
 */
const FOOTNOTE_LABEL: Record<string, string> = {
  ja: '注釈',
  en: 'Notes',
  zh: '注释',
  ko: '주석',
};

/**
 * 本文へ戻る記号（`↩`）の読み上げラベル。`{n}` に注釈の番号が入る。
 *
 * 目に映るのは記号だけなので見落とされやすいが、読み上げはこの文を読む。
 * 見出しだけ訳してここを英語のまま残すと、一箇所だけ英語が挟まる。
 */
const FOOTNOTE_BACK_LABEL: Record<string, string> = {
  ja: '注釈 {n} の参照元へ戻る',
  en: 'Back to reference {n}',
  zh: '返回注释 {n} 的引用处',
  ko: '주석 {n} 참조 위치로 돌아가기',
};

/**
 * hast のうち、ここで触るぶんだけの形。型のためだけに `@types/hast` を足さない。
 */
interface HastNode {
  type: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
}

/** 印のそばへ置く注釈の本文。重ねて出すか隠すかは、当てる側の体裁に任せる。 */
const POPOVER_CLASS = 'mdb-footnote__pop';

/** 末尾一覧の項目に付く id の頭。remark-rehype が付ける形。 */
const DEFINITION_ID_PREFIX = 'user-content-fn-';

/** 要素の文字を集める。戻る記号は本文ではないので落とす。 */
function textOf(node: HastNode): string {
  if (node.type === 'text') return node.value ?? '';
  if (node.properties?.['dataFootnoteBackref'] !== undefined) return '';
  return (node.children ?? []).map(textOf).join('');
}

/** 末尾一覧から「id → 本文」を集める。 */
function collectFootnoteBodies(node: HastNode, into: Map<string, string>): void {
  const id = node.properties?.['id'];
  if (typeof id === 'string' && id.startsWith(DEFINITION_ID_PREFIX)) {
    into.set(id, textOf(node).trim());
  }
  for (const child of node.children ?? []) collectFootnoteBodies(child, into);
}

/** 印の直後へ本文を差し込む。 */
function attachPopovers(node: HastNode, bodies: Map<string, string>): void {
  const children = node.children;
  if (children === undefined) return;

  const next: HastNode[] = [];
  for (const child of children) {
    attachPopovers(child, bodies);
    next.push(child);

    if (child.properties?.['dataFootnoteRef'] === undefined) continue;
    const href = child.properties['href'];
    const body = typeof href === 'string' ? bodies.get(href.replace(/^#/, '')) : undefined;
    if (body === undefined || body === '') continue;

    next.push({
      type: 'element',
      tagName: 'span',
      properties: {
        className: [POPOVER_CLASS],
        // 印には既に aria-describedby が付いていて、読み上げは末尾の本文を読む。
        // ここも読ませると同じ文が二度読まれる。
        ariaHidden: 'true',
      },
      children: [{ type: 'text', value: body }],
    } as HastNode);
  }

  node.children = next;
}

/**
 * 印（`[^1]`）のそばに、その注釈の本文をそのまま持たせる。
 *
 * 脚注は本文と離れた末尾に畳まれる。紙ならページを戻ればよいが、画面では
 * 読んでいた場所を見失う。印の隣に同じ文字を置いておけば、当てる側は
 * 重ねて出すだけで済む（出すかどうか・どう出すかは体裁の話なので持ち込まない）。
 */
function rehypeFootnotePopovers() {
  return (tree: unknown): void => {
    const root = tree as HastNode;
    const bodies = new Map<string, string>();
    collectFootnoteBodies(root, bodies);
    if (bodies.size === 0) return;
    attachPopovers(root, bodies);
  };
}

function buildProcessor(lang: string) {
  const backLabel = FOOTNOTE_BACK_LABEL[lang] ?? FOOTNOTE_BACK_LABEL['ja']!;

  return unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype, {
      footnoteLabel: FOOTNOTE_LABEL[lang] ?? FOOTNOTE_LABEL['ja']!,
      // 既定の `sr-only` を外す。見出しは隠さずに出し、体裁は各スタイルが当てる。
      footnoteLabelProperties: { className: ['mdb-footnotes__head'] },
      footnoteBackLabel: (referenceIndex, rereferenceIndex) => {
        // 同じ注釈を二度以上参照したときは `1-2` のように枝番が付く（既定と同じ形）。
        const number =
          rereferenceIndex > 1
            ? `${referenceIndex + 1}-${rereferenceIndex}`
            : String(referenceIndex + 1);
        return backLabel.replace('{n}', number);
      },
    })
    .use(rehypeFootnotePopovers)
    .use(rehypeStringify);
}

/**
 * 言語ごとに組み立てた processor を使い回す。見出しの文字列は remark-rehype の
 * 設定なので、言語が変わると別の processor になる。
 */
const processors = new Map<string, ReturnType<typeof buildProcessor>>();

function processorFor(lang: string): ReturnType<typeof buildProcessor> {
  const key = lang in FOOTNOTE_LABEL ? lang : 'ja';
  const cached = processors.get(key);
  if (cached !== undefined) return cached;

  const built = buildProcessor(key);
  processors.set(key, built);
  return built;
}

export function renderMarkdownToHtml(src: string, options: RenderMarkdownToHtmlOptions = {}): string {
  const { hasFrontmatter = true, lang = 'ja' } = options;
  const body = hasFrontmatter ? splitFrontmatter(src).body : src;
  const file = processorFor(lang).processSync(body);
  return String(file);
}
