import type { Spec } from '@md-business/schema-spec';
import { escapeHtml } from './escape.js';
import { renderSpecBody, type RenderSpecBodyOptions } from './specTemplate.js';

export interface RenderSpecHtmlOptions extends RenderSpecBodyOptions {
  /** Inline <style> contents (CSS string). Mutually exclusive with stylesHref. */
  embedStyles?: string;
  /** External stylesheet href to <link rel="stylesheet">. */
  stylesHref?: string;
  /** Document title (defaults to the spec title). */
  documentTitle?: string;
  /** Page language attribute (defaults to "ja"). */
  lang?: string;
}

export function renderSpecHtml(spec: Spec, options: RenderSpecHtmlOptions = {}): string {
  const lang = options.lang ?? 'ja';
  const title = options.documentTitle ?? spec.title;
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
${renderSpecBody(spec, options)}
</body>
</html>`;
}
