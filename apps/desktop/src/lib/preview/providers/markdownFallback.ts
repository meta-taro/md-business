/**
 * 標準 Markdown フォールバック・プレビュー。
 *
 * 業務スキーマ（invoice / spec / test-spec / db-spec / nosql-db-spec / api-spec）の
 * どれにも当たらない .md は「対応スキーマ無し」で空表示にせず、GitHub のように
 * 素の Markdown をそのまま描く。README や設計メモなど、スキーマ宣言の無い普通の
 * 文書を開いても読めるようにするのが目的（renderPreview が provider 解決に失敗した
 * 時のみ本フォールバックへ回す）。
 *
 * 本文は core の CSP 安全な MD→HTML パイプラインで HTML 化し、sanitizeViewerHtml で
 * inline `<svg>` / 画像 data URL を許しつつ `<script>` / event handler / `javascript:`
 * を落とす（prose provider と同じ防御）。
 */
import { renderMarkdownToHtml } from '@md-business/core';
import { buildPreviewDocument } from '../previewDocument';
import { sanitizeViewerHtml } from '../sanitizeHtml';
import type { PreviewOk, PreviewStyle, RenderPreviewOptions } from '../previewFactory';

/** 標準プレビューの書式 ID。業務スキーマの ID（invoice 等）と衝突しない名前にする。 */
const MARKDOWN_STYLE_ID = 'markdown';

/** 標準プレビューの最小プロース CSS（iframe 内で自己完結・テーマ追従）。 */
const MARKDOWN_CSS = `
:root {
  --md-fg: #1f2328;
  --md-muted: #59636e;
  --md-border: #d1d9e0;
  --md-code-bg: #f6f8fa;
  --md-accent: #0969da;
  --md-pop-bg: #ffffff;
}
:root[data-theme='dark'] {
  --md-fg: #e6edf3;
  --md-muted: #9198a1;
  --md-border: #3d444d;
  --md-code-bg: #151b23;
  --md-accent: #4493f8;
  --md-pop-bg: #1c2128;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  padding: 32px 40px 64px;
  max-width: 960px;
  color: var(--md-fg);
  font-family: -apple-system, 'Segoe UI', 'Hiragino Kaku Gothic ProN', 'Yu Gothic UI', Meiryo, sans-serif;
  font-size: 15px;
  line-height: 1.7;
  word-wrap: break-word;
}
h1, h2, h3, h4, h5, h6 { margin: 1.6em 0 0.6em; font-weight: 600; line-height: 1.3; }
h1 { font-size: 1.9em; padding-bottom: 0.3em; border-bottom: 1px solid var(--md-border); }
h2 { font-size: 1.5em; padding-bottom: 0.3em; border-bottom: 1px solid var(--md-border); }
h3 { font-size: 1.25em; }
:where(h1, h2, h3, h4, h5, h6):first-child { margin-top: 0; }
p, ul, ol, blockquote, table, pre { margin: 0 0 1em; }
a { color: var(--md-accent); text-decoration: none; }
a:hover { text-decoration: underline; }
ul, ol { padding-left: 1.6em; }
li + li { margin-top: 0.25em; }
blockquote {
  padding: 0 1em;
  color: var(--md-muted);
  border-left: 0.25em solid var(--md-border);
}
code {
  padding: 0.2em 0.4em;
  font-size: 0.88em;
  background: var(--md-code-bg);
  border-radius: 6px;
  font-family: 'Cascadia Code', 'Consolas', ui-monospace, monospace;
}
pre {
  padding: 14px 16px;
  /* コードフェンスは折り返す。印刷（PDF）は紙で横スクロールできないため、
     長い行を右端で欠落させず必ず改行して見せる（画面 = PDF の 1:1 を保つ）。 */
  white-space: pre-wrap;
  word-break: break-word;
  overflow-wrap: anywhere;
  background: var(--md-code-bg);
  border-radius: 8px;
}
pre code { padding: 0; background: none; white-space: inherit; }
/* 表は画面では広いと横スクロール（GitHub 流）。印刷時は @media print 側で
   セルを折り返し、列が右端で切れないようにする。 */
table { border-collapse: collapse; display: block; max-width: 100%; overflow: auto; }
th, td { padding: 6px 13px; border: 1px solid var(--md-border); }
th { font-weight: 600; }
img { max-width: 100%; }
hr { height: 1px; margin: 1.5em 0; border: 0; background: var(--md-border); }

/* PDF 出力（DESIGN §6.4）。A4 縦・実務的な余白。WebView の印刷（→「PDF として保存」）で
   画面プレビューと 1:1 の A4 正本になる。 */
@page {
  size: A4 portrait;
  margin: 16mm;
}

@media print {
  body {
    padding: 0;
    max-width: none;
    font-size: 11pt;
  }
  /* 印刷は横スクロール不可。表をブロック解除して通常フローに載せ、セルを
     折り返して全列を紙幅に収める（右端での列欠落を防ぐ）。 */
  table {
    display: table;
    width: 100%;
    overflow: visible;
    table-layout: fixed;
  }
  th, td {
    word-break: break-word;
    overflow-wrap: anywhere;
  }
  /* コードフェンス・見出し・表・画像はページ境界で不自然に割れないようにする。 */
  pre, blockquote, table, img { break-inside: avoid; }
  h1, h2, h3, h4, h5, h6 { break-after: avoid; }
}
/* 注釈（Markdown の脚注）。本文には肩番号だけが残り、本文は末尾へ畳まれる。 */
.footnotes {
  margin-top: 2.5em;
  padding-top: 1em;
  border-top: 1px solid var(--md-border);
  font-size: 0.875em;
  color: var(--md-muted);
}
/* 見出しの罫と余白を引き継がせない。注釈は章ではない。 */
.mdb-footnotes__head {
  margin: 0 0 0.6em;
  padding: 0;
  border: none;
  font-size: 1em;
  color: var(--md-fg);
}
.footnotes ol { margin: 0; padding-left: 1.6em; }
.footnotes li p { margin: 0; }
[data-footnote-ref] { font-weight: 600; text-decoration: none; }
.data-footnote-backref { margin-left: 0.4em; text-decoration: none; }
@media print {
  /* 紙の上では戻れない。押せない記号が並ぶだけになる。 */
  .data-footnote-backref { display: none; }
}

/* 印のそばに畳んである注釈の本文。既定は隠し、印に触れたときだけ重ねて出す。 */
sup:has([data-footnote-ref]) { position: relative; }
.mdb-footnote__pop {
  position: absolute;
  top: 1.8em;
  left: 0;
  z-index: 5;
  display: none;
  width: max-content;
  max-width: 320px;
  padding: 8px 10px;
  border: 1px solid var(--md-border);
  border-radius: 6px;
  background: var(--md-pop-bg);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.18);
  color: var(--md-fg);
  font-size: 0.875em;
  font-weight: 400;
  line-height: 1.6;
  text-align: left;
  white-space: normal;
}
sup:hover .mdb-footnote__pop,
[data-footnote-ref]:focus-visible + .mdb-footnote__pop { display: block; }
@media print {
  /* 紙には重ねられない。本文は末尾の一覧に出ている。 */
  .mdb-footnote__pop { display: none; }
}
`;

/**
 * 標準プレビューの書式。静的サイトの一覧ページ（どの文書にも属さない）も
 * この書式で描くため、provider の外から参照できるようにしてある。
 */
export const MARKDOWN_STYLE: PreviewStyle = { id: MARKDOWN_STYLE_ID, css: MARKDOWN_CSS };

/** 先頭の ATX 見出し（# 見出し）をタイトルに採る。無ければ 'Markdown'。 */
function titleFromBody(body: string): string {
  const match = body.match(/^#{1,6}\s+(.+?)\s*#*\s*$/m);
  return match ? match[1].trim() : 'Markdown';
}

/** frontmatter 除去済みの本文を標準 Markdown プレビューとして描く。 */
export function renderMarkdownFallback(
  body: string,
  options: RenderPreviewOptions = {},
): PreviewOk {
  const bodyHtml = body
    ? sanitizeViewerHtml(renderMarkdownToHtml(body, { hasFrontmatter: false }))
    : '';
  const documentTitle = titleFromBody(body);

  return {
    ok: true,
    srcdoc: buildPreviewDocument({
      bodyHtml,
      css: MARKDOWN_CSS,
      cssHref: options.cssHref?.(MARKDOWN_STYLE_ID),
      title: documentTitle,
      theme: options.theme,
      shortcuts: options.shortcuts,
    }),
    style: MARKDOWN_STYLE,
    documentTitle,
    label: 'Markdown',
    warnings: [],
    errors: [],
  };
}
