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
import type { PreviewOk, RenderPreviewOptions } from '../previewFactory';

/** 標準プレビューの最小プロース CSS（iframe 内で自己完結・テーマ追従）。 */
const MARKDOWN_CSS = `
:root {
  --md-fg: #1f2328;
  --md-muted: #59636e;
  --md-border: #d1d9e0;
  --md-code-bg: #f6f8fa;
  --md-accent: #0969da;
}
:root[data-theme='dark'] {
  --md-fg: #e6edf3;
  --md-muted: #9198a1;
  --md-border: #3d444d;
  --md-code-bg: #151b23;
  --md-accent: #4493f8;
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
  overflow: auto;
  background: var(--md-code-bg);
  border-radius: 8px;
}
pre code { padding: 0; background: none; }
table { border-collapse: collapse; display: block; overflow: auto; }
th, td { padding: 6px 13px; border: 1px solid var(--md-border); }
th { font-weight: 600; }
img { max-width: 100%; }
hr { height: 1px; margin: 1.5em 0; border: 0; background: var(--md-border); }
`;

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
      title: documentTitle,
      theme: options.theme,
    }),
    documentTitle,
    label: 'Markdown',
    warnings: [],
    errors: [],
  };
}
