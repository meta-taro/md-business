import type { Spec } from '@md-business/schema-spec';
import { escapeHtml } from './escape.js';
import { formatDateIso } from './format.js';

/**
 * Accent color presets — kept in sync with the invoice template so both
 * document types share a single design vocabulary. Authors who need a brand
 * color can pass an explicit `#rrggbb` instead.
 */
const THEME_PRESETS: Record<string, string> = {
  blue: '#2a4d7a',
  red: '#b91c1c',
  yellow: '#b8860b',
  orange: '#c2410c',
  purple: '#6d28d9',
  black: '#1f1f1f',
  gray: '#4b5563',
};

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

function resolveThemeColor(theme: string | undefined): string | null {
  if (!theme) return null;
  const trimmed = theme.trim();
  if (!trimmed) return null;
  const preset = THEME_PRESETS[trimmed.toLowerCase()];
  if (preset) return preset;
  if (HEX_COLOR.test(trimmed)) return trimmed;
  return null;
}

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
  const { bodyHtml = '', hideCover = false } = options;
  const themeColor = resolveThemeColor(spec.theme);
  const themeStyle = themeColor ? ` style="--mdb-color-accent:${themeColor}"` : '';

  const cover = hideCover
    ? ''
    : `
    <section class="mdb-spec__cover">
      <div class="mdb-spec__cover-inner">
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
      ${cover}
      ${body}
    </article>
  `;
}
