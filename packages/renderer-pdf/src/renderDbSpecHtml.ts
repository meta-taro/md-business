import type { DbSpec } from '@md-business/schema-db-spec';
import { escapeHtml } from './escape.js';
import { renderDbSpecBody, type RenderDbSpecBodyOptions } from './dbSpecTemplate.js';

export interface RenderDbSpecHtmlOptions extends RenderDbSpecBodyOptions {
  /** Inline <style> contents (CSS string). Mutually exclusive with stylesHref. */
  embedStyles?: string;
  /** External stylesheet href to <link rel="stylesheet">. */
  stylesHref?: string;
  /** Document title (defaults to the db-spec title). */
  documentTitle?: string;
  /** Page language attribute (defaults to "ja"). */
  lang?: string;
}

export function renderDbSpecHtml(dbSpec: DbSpec, options: RenderDbSpecHtmlOptions = {}): string {
  const lang = options.lang ?? 'ja';
  const title = options.documentTitle ?? dbSpec.title;
  const styleTag = options.embedStyles ? `<style>${options.embedStyles}</style>` : '';
  const linkTag = options.stylesHref
    ? `<link rel="stylesheet" href="${escapeHtml(options.stylesHref)}">`
    : '';

  return `<!doctype html>
<html lang="${escapeHtml(lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
${linkTag}
${styleTag}
</head>
<body>
${renderDbSpecBody(dbSpec, options)}
</body>
</html>`;
}
