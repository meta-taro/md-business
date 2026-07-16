import type { NosqlDbSpec } from '@md-business/schema-nosql-db-spec';
import { escapeHtml } from './escape.js';
import {
  renderNosqlDbSpecBody,
  type RenderNosqlDbSpecBodyOptions,
} from './nosqlDbSpecTemplate.js';

export interface RenderNosqlDbSpecHtmlOptions extends RenderNosqlDbSpecBodyOptions {
  /** Inline <style> contents (CSS string). Mutually exclusive with stylesHref. */
  embedStyles?: string;
  /** External stylesheet href to <link rel="stylesheet">. */
  stylesHref?: string;
  /** Document title (defaults to the nosql-db-spec title). */
  documentTitle?: string;
  /** Page language attribute (defaults to "ja"). */
  lang?: string;
}

export function renderNosqlDbSpecHtml(
  nosqlDbSpec: NosqlDbSpec,
  options: RenderNosqlDbSpecHtmlOptions = {},
): string {
  const lang = options.lang ?? 'ja';
  const title = options.documentTitle ?? nosqlDbSpec.title;
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
${renderNosqlDbSpecBody(nosqlDbSpec, options)}
</body>
</html>`;
}
