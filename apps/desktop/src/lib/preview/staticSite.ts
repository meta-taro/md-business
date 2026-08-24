/**
 * 静的サイトの組み立て（純ロジック・ファイル操作なし）。
 *
 * 開いているフォルダの `.md` をまとめて HTML にし、`dist/` へ置ける形の
 * ファイル一覧を返す。書き込みは Rust 側（export_site）が行う。ここが純関数なのは、
 * 「どのページが出るか」「リンクがどう変わるか」を実際に書き出さずに試せるようにするため。
 *
 * 単一 HTML 書き出し（htmlExport）との違いは 3 つだけで、描画そのものは同じ経路を通る:
 *   - CSS を各ページに埋め込まず `assets/<書式>.css` へ 1 本にまとめる
 *   - 文書どうしの `.md` リンクを `.html` へ書き換える（サイト内で行き先が切れないように）
 *   - 一覧ページ（index.html）を作る
 *
 * ローカル画像は出ない。プレビューと単一 HTML は、描く前に本文の画像を data URL へ
 * 置き換えている（inlineImages）。ここは中身を渡されるだけの純関数で読み込む口を持たず、
 * まとめて出す以上「実体を `assets/` へ運ぶか、各ページへ埋めるか」の判断も別に要る。
 */
import { collectImageRefs, inlineImages, resolveImagePath } from '../image/inlineImages';
import { renderPreview } from './renderPreview';
import { buildPreviewDocument } from './previewDocument';
import { MARKDOWN_STYLE } from './providers/markdownFallback';

/** 入力：ワークスペース相対のパスと、その中身。 */
export interface SiteSource {
  /** ワークスペース相対パス（`/` 区切り）。 */
  path: string;
  /** `.md` の全文。 */
  source: string;
}

/** 出力：サイトのルート（= `dist/`）から見た相対パスと中身。 */
export interface SiteFile {
  path: string;
  content: string;
}

/** 一緒に運ぶ画像。中身はここでは読まない（書き込む側が元の場所から写す）。 */
export interface SiteAsset {
  /** ワークスペース相対の元の場所。 */
  src: string;
  /** サイトのルートから見た置き場。 */
  dest: string;
}

/** 出さなかった文書と、その理由。数だけ数えて黙らせない。 */
export interface SiteSkip {
  path: string;
  reason: string;
}

export interface SitePlan {
  /** 書き出すファイル（ページ + CSS + 一覧）。 */
  files: SiteFile[];
  /** 生成したページのパス（サイト相対）。 */
  pages: string[];
  /** ページが指している画像。ファイルとして運ぶ（ページには埋め込まない）。 */
  assets: SiteAsset[];
  skipped: SiteSkip[];
}

export interface BuildStaticSiteOptions {
  /** 一覧ページの見出し。開いているフォルダ名を渡す想定。 */
  title?: string;
  /**
   * 本文に直接書かれた HTML をそのまま載せるか。既定は載せない。
   *
   * 渡してよいのは、web モードを宣言していて、かつこの PC で人が 1 回許した
   * プロジェクトだけ。載ったものを動かすかどうかは、出す側（待ち受けが付ける
   * 実行の指示）が決める。
   */
  rawHtml?: boolean;
}

const MD_EXT = /\.md$/i;
const HREF = /href="([^"]*)"/g;
const SRC = /src="([^"]*)"/g;
/** サイトの中の画像置き場。 */
const IMAGE_DIR = 'assets/img';
/**
 * 描く前に画像へ差しておく道。掃除（sanitizeHtml）は `src` の相対パスを落とすが、
 * `/` で始まるものは通す。描き終えてから、そのページの深さに合わせた道へ付け替える。
 */
const IMAGE_MARK = '/__image/';
/** `scheme:` で始まる（= 外部 URL）。相対パスとして解決してはいけない。 */
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 区切りを `/` に揃え、先頭の `./` を落とす。 */
function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\//, '');
}

/** そのページから見た `assets/` までの戻り（深さぶんの `../`）。 */
function upToRoot(pagePath: string): string {
  return '../'.repeat(pagePath.split('/').length - 1);
}

/** `a/b.md` → `a/b.html`。 */
function toHtmlPath(path: string): string {
  return path.replace(MD_EXT, '.html');
}

/**
 * `fromPath`（ページ自身）の位置を起点に相対パスを畳む。
 * ルートより上へ出るものは null（サイトの外なので書き換えない）。
 */
function resolveRelative(fromPath: string, rel: string): string | null {
  const parts = fromPath.split('/');
  parts.pop();
  for (const segment of rel.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      if (parts.length === 0) return null;
      parts.pop();
      continue;
    }
    parts.push(segment);
  }
  return parts.join('/');
}

/** percent-encode された href を素のパスへ戻す（壊れていれば元のまま扱う）。 */
function decodePath(value: string): string {
  try {
    return decodeURI(value);
  } catch {
    return value;
  }
}

/**
 * `.md` を指す相対リンクを `.html` に付け替える。書き換えるのは
 * **サイトに実在するページを指しているものだけ**。出さなかった文書へのリンクを
 * 書き換えると、行った先が無いページになる。元のままなら少なくとも元の `.md` は開ける。
 */
function rewriteHref(raw: string, fromPath: string, pages: ReadonlySet<string>): string | null {
  const hashAt = raw.indexOf('#');
  const target = hashAt === -1 ? raw : raw.slice(0, hashAt);
  const hash = hashAt === -1 ? '' : raw.slice(hashAt);

  if (!MD_EXT.test(target)) return null;
  if (HAS_SCHEME.test(target) || target.startsWith('//') || target.startsWith('/')) return null;

  const resolved = resolveRelative(fromPath, decodePath(target));
  if (resolved === null || !pages.has(toHtmlPath(resolved))) return null;

  return `${target.slice(0, -3)}.html${hash}`;
}

function rewriteLinks(html: string, fromPath: string, pages: ReadonlySet<string>): string {
  return html.replace(HREF, (whole, raw: string) => {
    const next = rewriteHref(raw, fromPath, pages);
    return next === null ? whole : `href="${next}"`;
  });
}

/** 描く前に差した目印を、そのページから画像置き場までの道へ付け替える。 */
function rewriteImages(html: string, fromPath: string): string {
  return html.replace(SRC, (whole, raw: string) =>
    raw.startsWith(IMAGE_MARK)
      ? `src="${upToRoot(fromPath)}${IMAGE_DIR}/${raw.slice(IMAGE_MARK.length)}"`
      : whole,
  );
}

/**
 * 文書が指している画像を、運ぶ先の目印へ差し替える。
 * 解決できないもの（フォルダの外・外部）はそのまま置く（掃除の段で落ちる）。
 */
function markImages(doc: SiteSource, assets: Map<string, SiteAsset>): string {
  const marks = new Map<string, string>();
  for (const image of collectImageRefs(doc.source)) {
    const target = resolveImagePath(doc.path, image.ref);
    if (target === null) continue;
    assets.set(target, { src: target, dest: `${IMAGE_DIR}/${target}` });
    marks.set(image.raw, `${IMAGE_MARK}${encodeURI(target)}`);
  }
  return inlineImages(doc.source, marks);
}

interface RenderedPage {
  /** 元の `.md` のパス。 */
  source: string;
  /** サイト相対の出力パス。 */
  path: string;
  title: string;
  html: string;
}

/** どの文書にも属さない一覧ページ。標準プレビューと同じ書式で描く。 */
function buildIndexPage(title: string, pages: readonly RenderedPage[]): string {
  const items = pages
    .map(
      (page) =>
        `<li><a href="${escapeHtml(encodeURI(page.path))}">${escapeHtml(page.title)}</a>` +
        ` <code>${escapeHtml(page.source)}</code></li>`,
    )
    .join('\n');

  return buildPreviewDocument({
    bodyHtml: `<h1>${escapeHtml(title)}</h1>\n<ul>\n${items}\n</ul>`,
    css: MARKDOWN_STYLE.css,
    cssHref: `assets/${MARKDOWN_STYLE.id}.css`,
    title,
    theme: 'light',
    shortcuts: false,
  });
}

export async function buildStaticSite(
  docs: readonly SiteSource[],
  options: BuildStaticSiteOptions = {},
): Promise<SitePlan> {
  const sources = docs
    .map((doc) => ({ path: normalizePath(doc.path), source: doc.source }))
    // 走査順は OS 依存なので、出力（一覧の並び）を決定的にする。
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  const rendered: RenderedPage[] = [];
  const skipped: SiteSkip[] = [];
  /** 運ぶ画像。同じ画像を複数の文書が指しても 1 つにまとめる。 */
  const assets = new Map<string, SiteAsset>();
  /** 書式 ID → CSS。同じ書式のページは 1 本を共有する。 */
  const styles = new Map<string, string>();

  for (const doc of sources) {
    if (!MD_EXT.test(doc.path)) {
      skipped.push({ path: doc.path, reason: 'HTML にできるのは .md のみです' });
      continue;
    }
    const path = toHtmlPath(doc.path);
    // 1 枚ずつ順に待つ。スキーマの描画一式は初回だけ読み込まれ、以降は使い回されるので、
    // 同じ書式が続くフォルダでは待ちが増えない。
    const result = await renderPreview(markImages(doc, assets), {
      // 書き出しは常に明るい配色・ショートカット無し（単一 HTML 書き出しと同じ理由）。
      theme: 'light',
      shortcuts: false,
      cssHref: (styleId) => `${upToRoot(path)}assets/${styleId}.css`,
      rawHtml: options.rawHtml,
    });
    if (!result.ok) {
      skipped.push({ path: doc.path, reason: result.reason });
      continue;
    }
    styles.set(result.style.id, result.style.css);
    rendered.push({ source: doc.path, path, title: result.documentTitle, html: result.srcdoc });
  }

  const pagePaths = new Set(rendered.map((page) => page.path));
  const files: SiteFile[] = rendered.map((page) => ({
    path: page.path,
    content: rewriteImages(rewriteLinks(page.html, page.path, pagePaths), page.path),
  }));

  // 利用者が自分で index.md を置いているなら、そちらが一覧より意図に近い。
  if (!pagePaths.has('index.html')) {
    styles.set(MARKDOWN_STYLE.id, MARKDOWN_STYLE.css);
    files.push({
      path: 'index.html',
      content: buildIndexPage(options.title ?? 'index', rendered),
    });
  }

  for (const [id, css] of styles) {
    files.push({ path: `assets/${id}.css`, content: css });
  }

  return {
    files,
    pages: rendered.map((page) => page.path),
    assets: [...assets.values()],
    skipped,
  };
}
