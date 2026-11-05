import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkCjkFriendly from 'remark-cjk-friendly';
import remarkCjkFriendlyGfmStrikethrough from 'remark-cjk-friendly-gfm-strikethrough';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import GithubSlugger from 'github-slugger';
import { splitFrontmatter } from './frontmatter.js';
import { findInternalBlocks, stripInternalBlocks } from './edition.js';
import type { DocumentEdition } from './edition.js';
import {
  acceptRevisions,
  markRevisions,
  REVISION_DEL_CLOSE,
  REVISION_DEL_OPEN,
  REVISION_INS_CLOSE,
  REVISION_INS_OPEN,
} from './revisions.js';
import type { RevisionView } from './revisions.js';
import { remarkInlineMarks } from './inlineMarks.js';
import { rehypeToc, TOC_LABEL } from './toc.js';

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
 *     `rawHtml: true` はその既定を外すが、それだけでは足りない。呼ぶ側は
 *     受けた HTML を素通しすることになる（sanitizer に通せば結局落ちる）ので、
 *     出す先で script を止める指示が別に要る。
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
  /**
   * 本文に直接書かれた HTML をそのまま通すか。既定は通さない。
   *
   * `true` にしてよいのは、そのプロジェクトが web モードを宣言していて、
   * かつこの PC で人が 1 回許している場合だけ。宣言だけでは足りない
   * （宣言はプロジェクトの中にあるので、中身を書いた側が自由に書ける）。
   */
  rawHtml?: boolean;
  /**
   * `::: 社内` 〜 `:::` の囲みをどう出すか。既定の `internal` は「社内」の札を付けた
   * 枠で囲んで出し、`submission`（提出版）は囲みごと落とす。
   */
  edition?: DocumentEdition;
  /**
   * 改版の印（`{++追加++}` `{--削除--}` `{~~前~>後~~}`）をどう出すか。既定の `marked` は
   * 追加に下線・削除に取り消し線を付け、印のある段落の余白に縦線を引く。
   * `clean` は印を外した清書にする。版（`edition`）とは別に選べる。
   */
  revisions?: RevisionView;
  /**
   * 見出し（h1〜h3）から目次を作って文書の頭に置くか。既定は置かない
   * （目次を手で書いている文書もあるので、黙って増やさない）。
   */
  toc?: boolean;
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

/** 社内の囲みに付ける札。 */
const INTERNAL_LABEL: Record<string, string> = {
  ja: '社内',
  en: 'Internal',
  zh: '内部',
  ko: '사내',
};

/**
 * 囲みの開き・閉じを、描いたあとで見つけるための目印の段落。
 * 生の HTML は既定で落ちるので、本文の段階では HTML を差し込めない。
 */
const INTERNAL_OPEN_MARK = 'MDBINTERNALOPEN9f4c2e';
const INTERNAL_CLOSE_MARK = 'MDBINTERNALCLOSE9f4c2e';

/**
 * hast のうち、ここで触るぶんだけの形。型のためだけに `@types/hast` を足さない。
 */
interface HastNode {
  type: string;
  /** 要素の名前（`p` / `img` など）。文字だけの節には無い。 */
  tagName?: string;
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

/** 図とその説明の入れ物。体裁（寄せ・字の大きさ）は当てる側に任せる。 */
const FIGURE_CLASS = 'mdb-figure';
const FIGURE_CAPTION_CLASS = 'mdb-figure__caption';

/** 段落が画像 1 つだけで出来ているなら、その画像を返す。 */
function loneImageOf(node: HastNode): HastNode | null {
  if (node.type !== 'element' || node.tagName !== 'p') return null;
  // 改行はそのまま文字として残る。画像 1 つだけの段落でも前後に空白が入る。
  const kept = (node.children ?? []).filter(
    (child) => child.type !== 'text' || (child.value ?? '').trim() !== '',
  );
  if (kept.length !== 1) return null;
  const only = kept[0]!;
  return only.type === 'element' && only.tagName === 'img' ? only : null;
}

/**
 * 画像に書かれた題名（`![説明](図.png "題名")`）を、図の下の説明文として出す。
 *
 * Markdown の題名は当たると吹き出し（tooltip）になるだけで、紙にも読み上げにも出ない。
 * 図の下に置けば、本文を追っている人がその図が何かを図のそばで読める（構成図は
 * 題名を図の中に描かないので、書いても今までどこにも出ていなかった）。
 *
 * 替えるのは**画像 1 つだけで出来た段落**に限る。文の途中の画像を入れ物へ移すと、
 * 文が図の前後で切れる。
 */
function rehypeImageCaptions() {
  return (tree: unknown): void => {
    const walk = (node: HastNode): void => {
      const children = node.children;
      if (children === undefined) return;

      children.forEach((child, index) => {
        walk(child);

        const image = loneImageOf(child);
        if (image === null) return;
        const title = image.properties?.['title'];
        if (typeof title !== 'string' || title.trim() === '') return;

        // 見えるところへ出したので、同じ文字を吹き出しにも出さない。
        delete image.properties!['title'];
        children[index] = {
          type: 'element',
          tagName: 'figure',
          properties: { className: [FIGURE_CLASS] },
          children: [
            image,
            {
              type: 'element',
              tagName: 'figcaption',
              properties: { className: [FIGURE_CAPTION_CLASS] },
              children: [{ type: 'text', value: title }],
            },
          ],
        };
      });
    };
    walk(tree as HastNode);
  };
}

function isMarkParagraph(node: HastNode, mark: string): boolean {
  return node.type === 'element' && node.tagName === 'p' && textOf(node) === mark;
}

/**
 * 目印の段落に挟まれた並びを「社内」の枠へ入れ替える。
 * 目印は行頭の囲みからしか作らないので、最上位の並びだけを見れば足りる。
 */
function rehypeInternalBlocks(label: string) {
  return () => (tree: unknown) => {
    const root = tree as HastNode;
    const out: HastNode[] = [];
    let box: HastNode | null = null;

    for (const node of root.children ?? []) {
      if (isMarkParagraph(node, INTERNAL_OPEN_MARK)) {
        box = {
          type: 'element',
          tagName: 'div',
          properties: { className: ['mdb-internal'] },
          children: [
            {
              type: 'element',
              tagName: 'p',
              properties: { className: ['mdb-internal__label'] },
              children: [{ type: 'text', value: label }],
            },
          ],
        };
        out.push(box);
        continue;
      }
      if (isMarkParagraph(node, INTERNAL_CLOSE_MARK)) {
        box = null;
        continue;
      }
      if (box !== null) box.children!.push(node);
      else out.push(node);
    }
    root.children = out;
  };
}

/** 囲みの開き・閉じの行を、前後を空けた目印の段落に置き換える。 */
const REVISION_TAG: Record<string, { open: boolean; tagName: 'ins' | 'del' }> = {
  [REVISION_INS_OPEN]: { open: true, tagName: 'ins' },
  [REVISION_INS_CLOSE]: { open: false, tagName: 'ins' },
  [REVISION_DEL_OPEN]: { open: true, tagName: 'del' },
  [REVISION_DEL_CLOSE]: { open: false, tagName: 'del' },
};
const REVISION_SPLIT = new RegExp(
  `([${REVISION_INS_OPEN}${REVISION_INS_CLOSE}${REVISION_DEL_OPEN}${REVISION_DEL_CLOSE}])`,
);
/** 余白に縦線を引く単位。印を含むいちばん内側の塊に付ける。 */
const CHANGE_BAR_BLOCKS = new Set(['p', 'li', 'td', 'th', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'dt', 'dd']);

/**
 * 区切りの文字に挟まれた並びを `<ins>` / `<del>` へ入れ替える。
 *
 * 区切りは同じ親の並びの中で開いて閉じる。`{++**太字**++}` のように印が強調を包むと、
 * 開きと閉じが強調の外側（兄弟の文字）に来るので、親の並びごと組み直す。
 * 戻り値は、この並びに印が入ったか。
 */
function wrapRevisionChildren(node: HastNode): boolean {
  if (node.children === undefined) return false;
  let changed = false;
  for (const child of node.children) {
    if (child.type === 'element' && wrapRevisionChildren(child)) changed = true;
  }

  const root: HastNode[] = [];
  const stack: HastNode[] = [];
  const push = (item: HastNode): void => {
    const top = stack[stack.length - 1];
    if (top === undefined) root.push(item);
    else top.children!.push(item);
  };
  let hasMarker = false;

  for (const child of node.children) {
    if (child.type !== 'text' || child.value === undefined || !REVISION_SPLIT.test(child.value)) {
      push(child);
      continue;
    }
    hasMarker = true;
    for (const piece of child.value.split(REVISION_SPLIT)) {
      const tag = REVISION_TAG[piece];
      if (tag === undefined) {
        if (piece !== '') push({ type: 'text', value: piece });
      } else if (tag.open) {
        const element: HastNode = {
          type: 'element',
          tagName: tag.tagName,
          properties: { className: [tag.tagName === 'ins' ? 'mdb-ins' : 'mdb-del'] },
          children: [],
        };
        push(element);
        stack.push(element);
      } else if (stack[stack.length - 1]?.tagName === tag.tagName) {
        stack.pop();
      }
    }
  }

  if (hasMarker) {
    node.children = root;
    changed = true;
  }
  if (changed && node.tagName !== undefined && CHANGE_BAR_BLOCKS.has(node.tagName)) {
    const properties = (node.properties ??= {});
    const current = properties['className'];
    const classes = Array.isArray(current) ? current : [];
    if (!classes.includes('mdb-changed')) properties['className'] = [...classes, 'mdb-changed'];
    // 縦線は内側の塊だけに引く。外側にも引くと、表の行やリストで二重になる。
    return false;
  }
  return changed;
}

function rehypeRevisionMarks() {
  return (tree: unknown) => {
    wrapRevisionChildren(tree as HastNode);
  };
}

function markInternalBlocks(body: string): string {
  const blocks = findInternalBlocks(body);
  if (blocks.length === 0) return body;

  const lines = body.split('\n');
  for (const block of blocks) {
    lines[block.start] = `\n${INTERNAL_OPEN_MARK}\n`;
    if (block.closed) lines[block.end] = `\n${INTERNAL_CLOSE_MARK}\n`;
  }
  return lines.join('\n');
}

/** 図の説明の頭にある番号（`図 2-1` / `表 3` / `Figure 1.2`）。 */
const FIGURE_LABEL = /^(?:図|表|Figure|Fig\.|Table)\s*\d+(?:[-.‐－]\d+)*/;
const HEADING = /^h[1-6]$/;

/** id の元にする文字。改版の印の削除側は除く（印ありでも清書でも同じ id になる）。 */
function anchorTextOf(node: HastNode): string {
  if (node.type === 'text') return node.value ?? '';
  if (node.tagName === 'del') return '';
  if (node.properties?.['ariaHidden'] === 'true') return '';
  return (node.children ?? []).map(anchorTextOf).join('');
}

/**
 * 見出しと、説明の付いた図に id を付け、`[図 2-1 へ戻る](#図-2-1)` のようなリンクの行き先にする。
 *
 * 見出しの id は GitHub と同じ規則にする。GitHub で書いた目次のリンクがそのまま効く。
 * 図は説明が番号で始まるなら番号だけ（`#図-2-1`）、そうでなければ説明の文字で指す。
 * 説明の後半を書き直しても、番号で張ったリンクは切れない。
 *
 * 同じ id は文書の頭から順に枝番で分ける（見出しと図で 1 つの数え方を使う）。
 * PDF も同じ id をリンクの行き先にするので、印刷しても文書の中で飛べる。
 */
function rehypeAnchors() {
  return (tree: unknown): void => {
    const slugger = new GithubSlugger();
    const walk = (node: HastNode): void => {
      if (node.type === 'element' && node.properties?.['id'] === undefined) {
        const tag = node.tagName ?? '';
        if (HEADING.test(tag)) {
          node.properties = { ...node.properties, id: slugger.slug(anchorTextOf(node).trim()) };
        } else if (tag === 'figure') {
          const caption = (node.children ?? []).find((child) => child.tagName === 'figcaption');
          const text = caption === undefined ? '' : anchorTextOf(caption).trim();
          if (text !== '') {
            const label = FIGURE_LABEL.exec(text)?.[0] ?? text;
            node.properties = { ...node.properties, id: slugger.slug(label) };
          }
        }
      }
      for (const child of node.children ?? []) walk(child);
    };
    walk(tree as HastNode);
  };
}

interface ProcessorSettings {
  lang: string;
  rawHtml: boolean;
  /** マーカー（`==…==` / `<mark>`）を出すか。提出版では外す。 */
  highlight: boolean;
  toc: boolean;
}

function buildProcessor({ lang, rawHtml, highlight, toc }: ProcessorSettings) {
  const backLabel = FOOTNOTE_BACK_LABEL[lang] ?? FOOTNOTE_BACK_LABEL['ja']!;

  return unified()
    .use(remarkParse)
    .use(remarkGfm)
    // CommonMark は閉じる記号の直前が約物（」や。）だと、後ろに文字が続く限り閉じとみなさない。
    // 日本語では `**「重要」**です` が強調にならず、記号がそのまま刷られる。
    .use(remarkCjkFriendly)
    .use(remarkCjkFriendlyGfmStrikethrough)
    .use(remarkInlineMarks({ highlight }))
    .use(remarkRehype, {
      allowDangerousHtml: rawHtml,
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
    .use(rehypeImageCaptions)
    .use(rehypeInternalBlocks(INTERNAL_LABEL[lang] ?? INTERNAL_LABEL['ja']!))
    .use(rehypeRevisionMarks)
    .use(rehypeAnchors)
    .use(toc ? rehypeToc(TOC_LABEL[lang] ?? TOC_LABEL['ja']!, anchorTextOf) : () => undefined)
    .use(rehypeStringify, { allowDangerousHtml: rawHtml });
}

/**
 * 組み立てた processor を使い回す。見出しの文字列・生の HTML を通すか・マーカーの有無・
 * 目次の有無はどれも組み立て時の設定なので、どれかが変わると別の processor になる。
 */
const processors = new Map<string, ReturnType<typeof buildProcessor>>();

function processorFor(settings: ProcessorSettings): ReturnType<typeof buildProcessor> {
  const language = settings.lang in FOOTNOTE_LABEL ? settings.lang : 'ja';
  const key = `${language}:${settings.rawHtml}:${settings.highlight}:${settings.toc}`;
  const cached = processors.get(key);
  if (cached !== undefined) return cached;

  const built = buildProcessor({ ...settings, lang: language });
  processors.set(key, built);
  return built;
}

export function renderMarkdownToHtml(src: string, options: RenderMarkdownToHtmlOptions = {}): string {
  const {
    hasFrontmatter = true,
    lang = 'ja',
    rawHtml = false,
    edition = 'internal',
    revisions = 'marked',
    toc = false,
  } = options;
  const raw = hasFrontmatter ? splitFrontmatter(src).body : src;
  const edited =
    edition === 'submission' ? stripInternalBlocks(raw).text : markInternalBlocks(raw);
  const body = revisions === 'clean' ? acceptRevisions(edited) : markRevisions(edited);
  const file = processorFor({ lang, rawHtml, highlight: edition !== 'submission', toc }).processSync(body);
  return String(file);
}
