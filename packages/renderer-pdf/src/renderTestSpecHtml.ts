import type { TestSpec } from '@md-business/schema-test-spec';
import { escapeHtml } from './escape.js';
import { renderTestSpecBody, type RenderTestSpecBodyOptions } from './testSpecTemplate.js';

export interface RenderTestSpecHtmlOptions extends RenderTestSpecBodyOptions {
  /** Inline <style> contents (CSS string). Mutually exclusive with stylesHref. */
  embedStyles?: string;
  /** External stylesheet href to <link rel="stylesheet">. */
  stylesHref?: string;
  /** Document title (defaults to the test-spec title). */
  documentTitle?: string;
  /** Page language attribute (defaults to "ja"). */
  lang?: string;
}

export function renderTestSpecHtml(spec: TestSpec, options: RenderTestSpecHtmlOptions = {}): string {
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
${renderTestSpecBody(spec, options)}
</body>
</html>`;
}
