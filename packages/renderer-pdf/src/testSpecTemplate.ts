import type { TestSpec, TestSpecColumn, ColumnType } from '@md-business/schema-test-spec';
import { escapeHtml } from './escape.js';
import { formatDateIso } from './format.js';

/**
 * Accent color presets — kept in sync with the spec / invoice templates so all
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
  executing: '実施中',
  completed: '完了',
};

function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

const COLUMN_TYPE_LABELS: Record<ColumnType, string> = {
  text: '文字列',
  multiline_text: '複数行',
  enum: 'プルダウン',
  date: '日付',
  number: '数値',
  checkbox: 'チェックボックス',
  url: 'URL',
};

const VISUAL_KEY_LABELS: Record<string, string> = {
  row_background: '行背景色',
  background: '背景色',
  color: '文字色',
};

function renderPeopleList(label: string, people: Array<{ name: string; role?: string }> | undefined): string {
  if (!people || people.length === 0) return '';
  const items = people
    .map((p) => {
      const role = p.role ? `<span class="mdb-test-spec__role">（${escapeHtml(p.role)}）</span>` : '';
      return `<li>${escapeHtml(p.name)}${role}</li>`;
    })
    .join('');
  return `
    <section class="mdb-test-spec__people">
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
    <section class="mdb-test-spec__related">
      <h2>関連文書</h2>
      <ul>${items}</ul>
    </section>
  `;
}

function renderGoogleSheetId(googleSheetId: string | undefined): string {
  if (!googleSheetId) return '';
  return `
    <section class="mdb-test-spec__sheet">
      <h2>連携 Google Sheets</h2>
      <p><code>${escapeHtml(googleSheetId)}</code></p>
    </section>
  `;
}

function renderColumnTypeCell(column: TestSpecColumn): string {
  const baseLabel = COLUMN_TYPE_LABELS[column.type] ?? column.type;
  if (column.type === 'enum' && column.values && column.values.length > 0) {
    const values = column.values.map((v) => escapeHtml(v)).join(' / ');
    return `${escapeHtml(baseLabel)} <span class="mdb-test-spec__column-values">(${values})</span>`;
  }
  if (column.type === 'number' && (column.min !== undefined || column.max !== undefined)) {
    const range = `${column.min ?? '*'} 〜 ${column.max ?? '*'}`;
    return `${escapeHtml(baseLabel)} <span class="mdb-test-spec__column-range">[${escapeHtml(range)}]</span>`;
  }
  return escapeHtml(baseLabel);
}

function renderVisualCell(column: TestSpecColumn): string {
  if (!column.visual) return '';
  const entries = Object.entries(column.visual);
  if (entries.length === 0) return '';
  const items = entries
    .map(([enumKey, style]) => {
      const styleParts: string[] = [];
      if (style.row_background) styleParts.push(`${VISUAL_KEY_LABELS.row_background}: ${style.row_background}`);
      if (style.background) styleParts.push(`${VISUAL_KEY_LABELS.background}: ${style.background}`);
      if (style.color) styleParts.push(`${VISUAL_KEY_LABELS.color}: ${style.color}`);
      const parts = styleParts.map((p) => escapeHtml(p)).join(' / ');
      return `<li><strong>${escapeHtml(enumKey)}</strong>: ${parts}</li>`;
    })
    .join('');
  return `<ul class="mdb-test-spec__visual-list">${items}</ul>`;
}

function renderColumnsSection(columns: TestSpecColumn[] | undefined): string {
  if (!columns || columns.length === 0) return '';
  const rows = columns
    .map((column) => {
      const visualCell = renderVisualCell(column);
      return `
        <tr>
          <th scope="row">${escapeHtml(column.name)}</th>
          <td>${renderColumnTypeCell(column)}</td>
          <td>${visualCell}</td>
        </tr>
      `;
    })
    .join('');
  return `
    <section class="mdb-test-spec__columns">
      <h2>列定義</h2>
      <table class="mdb-test-spec__columns-table">
        <thead>
          <tr>
            <th scope="col">列名</th>
            <th scope="col">型</th>
            <th scope="col">書式</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </section>
  `;
}

export interface RenderTestSpecBodyOptions {
  /**
   * Pre-rendered HTML for the Markdown body. The viewer (chrome-extension)
   * is responsible for the md→HTML step — that's where the verification table
   * rendering belongs, not in the print renderer.
   */
  bodyHtml?: string;
  /**
   * When true, suppress the cover page. Useful for embedding a test-spec body
   * inside another document or for printing only the body section.
   */
  hideCover?: boolean;
}

/**
 * Render the printable HTML body for a verification sheet (検証シート).
 *
 * Layout:
 *   1. Cover page (status badge, title, documentNumber, version, issueDate,
 *      authors, reviewers, relatedDocs, googleSheetId).
 *   2. Columns definition table (列定義) — drives Sheets DataValidation +
 *      ConditionalFormat, so it doubles as a reference in the PDF.
 *   3. Body — the caller's pre-rendered Markdown HTML (typically the
 *      verification result table itself), wrapped in `.mdb-test-spec__body`.
 *
 * Theme color flows via `--mdb-color-accent` on the article element, picked
 * up by the print stylesheet for the cover accent bar, headings, and table
 * borders.
 */
export function renderTestSpecBody(spec: TestSpec, options: RenderTestSpecBodyOptions = {}): string {
  const { bodyHtml = '', hideCover = false } = options;
  const themeColor = resolveThemeColor(spec.theme);
  const themeStyle = themeColor ? ` style="--mdb-color-accent:${themeColor}"` : '';

  const cover = hideCover
    ? ''
    : `
    <section class="mdb-test-spec__cover">
      <div class="mdb-test-spec__cover-inner">
        <div class="mdb-test-spec__status mdb-test-spec__status--${escapeHtml(spec.status)}">${escapeHtml(statusLabel(spec.status))}</div>
        <h1 class="mdb-test-spec__title">${escapeHtml(spec.title)}</h1>
        <dl class="mdb-test-spec__meta">
          <dt>文書番号</dt><dd>${escapeHtml(spec.documentNumber)}</dd>
          <dt>版</dt><dd>${escapeHtml(spec.version)}</dd>
          <dt>発行日</dt><dd>${escapeHtml(formatDateIso(spec.issueDate))}</dd>
        </dl>
        ${renderPeopleList('作成者', spec.authors)}
        ${renderPeopleList('レビュアー', spec.reviewers)}
        ${renderRelatedDocs(spec.relatedDocs)}
        ${renderGoogleSheetId(spec.googleSheetId)}
      </div>
    </section>
  `;

  const columns = renderColumnsSection(spec.columns);

  const body = bodyHtml
    ? `<section class="mdb-test-spec__body">${bodyHtml}</section>`
    : '';

  return `
    <article class="mdb-test-spec" data-schema-version="${escapeHtml(spec.schema)}"${themeStyle}>
      ${cover}
      ${columns}
      ${body}
    </article>
  `;
}
