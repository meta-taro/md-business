import type { Investigation } from '@md-business/schema-investigation';
import { escapeHtml } from './escape.js';
import {
  renderInvestigationBody,
  type RenderInvestigationBodyOptions,
} from './investigationTemplate.js';

export interface RenderInvestigationHtmlOptions extends RenderInvestigationBodyOptions {
  /** Inline <style> contents (CSS string). Mutually exclusive with stylesHref. */
  embedStyles?: string;
  /** External stylesheet href to <link rel="stylesheet">. */
  stylesHref?: string;
  /** Document title (defaults to the investigation title). */
  documentTitle?: string;
  /** Page language attribute (defaults to "ja"). */
  lang?: string;
}

export function renderInvestigationHtml(
  investigation: Investigation,
  options: RenderInvestigationHtmlOptions = {},
): string {
  const lang = options.lang ?? 'ja';
  const title = options.documentTitle ?? investigation.title;
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
${renderInvestigationBody(investigation, options)}
</body>
</html>`;
}
