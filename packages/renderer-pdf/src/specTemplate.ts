import { resolveClassification, type DocumentEdition, type Spec } from '@md-business/schema-spec';
import { escapeHtml } from './escape.js';
import { themeStyleAttr } from './theme.js';
import { formatDateIso } from './format.js';

const STATUS_LABELS: Record<string, string> = {
  draft: 'ドラフト',
  review: 'レビュー中',
  approved: '承認済',
};

function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

function renderPeopleList(label: string, people: Array<{ name: string; role?: string }> | undefined): string {
  if (!people || people.length === 0) return '';
  const items = people
    .map((p) => {
      const role = p.role ? `<span class="mdb-spec__role">（${escapeHtml(p.role)}）</span>` : '';
      return `<li>${escapeHtml(p.name)}${role}</li>`;
    })
    .join('');
  return `
    <section class="mdb-spec__people">
      <h2>${escapeHtml(label)}</h2>
      <ul>${items}</ul>
    </section>
  `;
}

function renderRelatedDocs(relatedDocs: string[] | undefined): string {
  if (!relatedDocs || relatedDocs.length === 0) return '';
  const items = relatedDocs
    .map((doc) => `<li>${escapeHtml(doc)}</li>`)
    .join('');
  return `
    <section class="mdb-spec__related">
      <h2>関連文書</h2>
      <ul>${items}</ul>
    </section>
  `;
}

export interface RenderSpecBodyOptions {
  /**
   * Pre-rendered HTML for the Markdown body. The viewer (chrome-extension)
   * is responsible for the md→HTML step — that's where Mermaid blocks,
   * inline SVG, and image resolvers belong, not in the print renderer.
   */
  bodyHtml?: string;
  /**
   * When true, suppress the cover page. Useful for embedding a spec body
   * inside another document or for printing only the body section.
   */
  hideCover?: boolean;
  /**
   * 社内版か提出版か。表紙と各ページ右上に出す区分が変わる（提出版は提出用）。
   * 本文の社内の囲みを落とすのは bodyHtml を作る側の仕事。
   */
  edition?: DocumentEdition;
}

/**
 * CSS の文字列として埋める。`"` と `\` で文字列を抜けられないようにし、
 * `<` `>` も符号で書いて `</style>` で要素を閉じられないようにする。
 */
function cssString(value: string): string {
  const escaped = value.replace(/[\\"<>\n\r]/g, (ch) => {
    if (ch === '\\' || ch === '"') return `\\${ch}`;
    return `\\${ch.charCodeAt(0).toString(16)} `;
  });
  return `"${escaped}"`;
}

/**
 * 各ページの右上に区分を刷る。表紙は余白 0 なので出ず、表紙には自分の欄で出す。
 */
function renderPageClassification(classification: string): string {
  if (classification === '') return '';
  return `<style>@page { @top-right { content: ${cssString(classification)}; } }</style>`;
}

/**
 * Render the printable HTML body for a software design document.
 *
 * Layout:
 *   1. Cover page (title, status badge, version, issueDate, documentNumber,
 *      authors, reviewers, relatedDocs). Forced page break after.
 *   2. Body — the caller's pre-rendered Markdown HTML, wrapped in `.mdb-spec__body`.
 *
 * Theme color flows via `--mdb-color-accent` on the article element, picked
 * up by the print stylesheet for the cover page accent bar, headings, and
 * table borders.
 */
export function renderSpecBody(spec: Spec, options: RenderSpecBodyOptions = {}): string {
  const { bodyHtml = '', hideCover = false, edition = 'internal' } = options;
  const themeStyle = themeStyleAttr(spec.theme);
  const classification = resolveClassification(spec, edition);
  const classificationBadge =
    classification === ''
      ? ''
      : `<div class="mdb-spec__classification">${escapeHtml(classification)}</div>`;

  const cover = hideCover
    ? ''
    : `
    <section class="mdb-spec__cover">
      <div class="mdb-spec__cover-inner">
        ${classificationBadge}
        <div class="mdb-spec__status mdb-spec__status--${escapeHtml(spec.status)}">${escapeHtml(statusLabel(spec.status))}</div>
        <h1 class="mdb-spec__title">${escapeHtml(spec.title)}</h1>
        <dl class="mdb-spec__meta">
          <dt>文書番号</dt><dd>${escapeHtml(spec.documentNumber)}</dd>
          <dt>版</dt><dd>${escapeHtml(spec.version)}</dd>
          <dt>発行日</dt><dd>${escapeHtml(formatDateIso(spec.issueDate))}</dd>
        </dl>
        ${renderPeopleList('作成者', spec.authors)}
        ${renderPeopleList('レビュアー', spec.reviewers)}
        ${renderRelatedDocs(spec.relatedDocs)}
      </div>
    </section>
  `;

  const body = bodyHtml
    ? `<section class="mdb-spec__body">${bodyHtml}</section>`
    : '';

  return `
    <article class="mdb-spec" data-schema-version="${escapeHtml(spec.schemaVersion)}"${themeStyle}>
      ${renderPageClassification(classification)}
      ${cover}
      ${body}
    </article>
  `;
}
