import type {
  DbSpec,
  DbSpecColumn,
  DbSpecForeignKey,
  DbSpecIndex,
  DbSpecMigration,
  DbSpecPerson,
  DbSpecTable,
  DbSpecTrigger,
  ForeignKeyAction,
} from '@md-business/schema-db-spec';
import { escapeHtml } from './escape.js';
import { formatDateIso } from './format.js';

/**
 * Accent color presets — shared with the invoice / spec templates so every
 * document type speaks one design vocabulary. Authors can pass an explicit
 * `#rrggbb` instead of a preset name.
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
  deprecated: '非推奨',
};

function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

/**
 * Display labels for DB engines. The stored value is the normalized enum
 * (`postgres` / `mysql` / …); the renderer maps it to a human-facing brand
 * name for the cover. Unknown values fall back to the raw string.
 */
const ENGINE_LABELS: Record<string, string> = {
  postgres: 'PostgreSQL',
  mysql: 'MySQL',
  aurora: 'Amazon Aurora',
  sqlite: 'SQLite',
  neon: 'Neon',
  supabase: 'Supabase',
  turso: 'Turso',
  cloudsql: 'Cloud SQL',
};

function engineLabel(engine: string): string {
  return ENGINE_LABELS[engine] ?? engine;
}

const FK_ACTION_LABELS: Record<ForeignKeyAction, string> = {
  cascade: 'CASCADE',
  restrict: 'RESTRICT',
  set_null: 'SET NULL',
  no_action: 'NO ACTION',
};

function renderPeopleList(label: string, people: DbSpecPerson[] | undefined): string {
  if (!people || people.length === 0) return '';
  const items = people
    .map((p) => {
      const role = p.role ? `<span class="mdb-db-spec__role">（${escapeHtml(p.role)}）</span>` : '';
      return `<li>${escapeHtml(p.name)}${role}</li>`;
    })
    .join('');
  return `
    <section class="mdb-db-spec__people">
      <h2>${escapeHtml(label)}</h2>
      <ul>${items}</ul>
    </section>
  `;
}

function renderRelatedDocs(relatedDocs: string[] | undefined): string {
  if (!relatedDocs || relatedDocs.length === 0) return '';
  const items = relatedDocs.map((doc) => `<li>${escapeHtml(doc)}</li>`).join('');
  return `
    <section class="mdb-db-spec__related">
      <h2>関連文書</h2>
      <ul>${items}</ul>
    </section>
  `;
}

/** A check mark for boolean column attributes (PK / NOT NULL / UNIQUE). */
function mark(flag: boolean | undefined): string {
  return flag ? '<span class="mdb-db-spec__mark">✓</span>' : '';
}

/** Render a default value verbatim. Empty string when unset (never a filler). */
function renderDefault(value: DbSpecColumn['default']): string {
  if (value === undefined) return '';
  return escapeHtml(String(value));
}

function renderForeignKey(fk: DbSpecForeignKey | undefined): string {
  if (!fk) return '';
  const target = `${escapeHtml(fk.table)}.${escapeHtml(fk.column)}`;
  const actions: string[] = [];
  if (fk.onDelete) actions.push(`ON DELETE ${FK_ACTION_LABELS[fk.onDelete]}`);
  if (fk.onUpdate) actions.push(`ON UPDATE ${FK_ACTION_LABELS[fk.onUpdate]}`);
  const actionText = actions.length
    ? ` <span class="mdb-db-spec__fk-action">${escapeHtml(actions.join(' / '))}</span>`
    : '';
  return `→ ${target}${actionText}`;
}

function renderColumns(columns: DbSpecColumn[]): string {
  const rows = columns
    .map(
      (col) => `
        <tr>
          <td class="mdb-db-spec__col-name"><code>${escapeHtml(col.name)}</code></td>
          <td class="mdb-db-spec__col-type"><code>${escapeHtml(col.type)}</code></td>
          <td class="mdb-db-spec__col-flag">${mark(col.pk)}</td>
          <td class="mdb-db-spec__col-flag">${mark(col.nullable === false)}</td>
          <td class="mdb-db-spec__col-flag">${mark(col.unique)}</td>
          <td class="mdb-db-spec__col-default"><code>${renderDefault(col.default)}</code></td>
          <td class="mdb-db-spec__col-fk">${renderForeignKey(col.fk)}</td>
        </tr>`,
    )
    .join('');
  return `
    <table class="mdb-db-spec__columns">
      <thead>
        <tr>
          <th>列名</th><th>型</th><th>PK</th><th>NOT NULL</th><th>UNIQUE</th><th>デフォルト</th><th>外部キー</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderIndexes(indexes: DbSpecIndex[] | undefined): string {
  if (!indexes || indexes.length === 0) return '';
  const rows = indexes
    .map(
      (idx) => `
        <tr>
          <td><code>${escapeHtml(idx.name)}</code></td>
          <td>${escapeHtml(idx.columns.join(', '))}</td>
          <td class="mdb-db-spec__col-flag">${mark(idx.unique)}</td>
          <td>${idx.using ? escapeHtml(idx.using) : ''}</td>
        </tr>`,
    )
    .join('');
  return `
    <div class="mdb-db-spec__sub">
      <h4>インデックス</h4>
      <table class="mdb-db-spec__indexes">
        <thead>
          <tr><th>インデックス名</th><th>対象列</th><th>UNIQUE</th><th>方式</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function renderTriggers(triggers: DbSpecTrigger[] | undefined): string {
  if (!triggers || triggers.length === 0) return '';
  const rows = triggers
    .map(
      (trg) => `
        <tr>
          <td><code>${escapeHtml(trg.name)}</code></td>
          <td>${escapeHtml(trg.on)}</td>
          <td><code>${escapeHtml(trg.action)}</code></td>
        </tr>`,
    )
    .join('');
  return `
    <div class="mdb-db-spec__sub">
      <h4>トリガー</h4>
      <table class="mdb-db-spec__triggers">
        <thead>
          <tr><th>トリガー名</th><th>タイミング</th><th>アクション</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function renderTable(table: DbSpecTable): string {
  const description = table.description
    ? `<p class="mdb-db-spec__table-desc">${escapeHtml(table.description)}</p>`
    : '';
  return `
    <section class="mdb-db-spec__table">
      <h3 class="mdb-db-spec__table-name"><code>${escapeHtml(table.name)}</code></h3>
      ${description}
      ${renderColumns(table.columns)}
      ${renderIndexes(table.indexes)}
      ${renderTriggers(table.triggers)}
    </section>
  `;
}

function renderMigrations(migrations: DbSpecMigration[] | undefined): string {
  if (!migrations || migrations.length === 0) return '';
  const items = migrations
    .map((m) => {
      const desc = m.description
        ? ` <span class="mdb-db-spec__migration-desc">${escapeHtml(m.description)}</span>`
        : '';
      return `<li><code>${escapeHtml(m.id)}</code>${desc}</li>`;
    })
    .join('');
  return `
    <section class="mdb-db-spec__migrations">
      <h2>マイグレーション</h2>
      <ul>${items}</ul>
    </section>
  `;
}

export interface RenderDbSpecBodyOptions {
  /**
   * When true, suppress the cover page. Useful for embedding a DB spec body
   * inside another document or for printing only the table catalog.
   */
  hideCover?: boolean;
}

/**
 * Render the printable HTML body for a relational database design document.
 *
 * Layout:
 *   1. Cover page (title, status badge, version, issueDate, documentNumber,
 *      DB engine, charset/collation, authors, reviewers, relatedDocs).
 *   2. Table catalog — one section per table with a column definition table
 *      (name / type / PK / NOT NULL / UNIQUE / default / FK) plus optional
 *      index and trigger tables.
 *   3. Migration reference list (id + description).
 *
 * Unlike the spec renderer this consumes structured frontmatter directly —
 * there is no free Markdown body — so every value is escaped here. Empty
 * attributes render as empty cells (docs/data-cell-conventions.md: no em-dash
 * / N/A / TBD fillers).
 */
export function renderDbSpecBody(dbSpec: DbSpec, options: RenderDbSpecBodyOptions = {}): string {
  const { hideCover = false } = options;
  const themeColor = resolveThemeColor(dbSpec.theme);
  const themeStyle = themeColor ? ` style="--mdb-color-accent:${themeColor}"` : '';

  const charsetRow = dbSpec.charset
    ? `<dt>文字セット</dt><dd>${escapeHtml(dbSpec.charset)}</dd>`
    : '';
  const collationRow = dbSpec.collation
    ? `<dt>照合順序</dt><dd>${escapeHtml(dbSpec.collation)}</dd>`
    : '';

  const cover = hideCover
    ? ''
    : `
    <section class="mdb-db-spec__cover">
      <div class="mdb-db-spec__cover-inner">
        <div class="mdb-db-spec__status mdb-db-spec__status--${escapeHtml(dbSpec.status)}">${escapeHtml(statusLabel(dbSpec.status))}</div>
        <h1 class="mdb-db-spec__title">${escapeHtml(dbSpec.title)}</h1>
        <dl class="mdb-db-spec__meta">
          <dt>文書番号</dt><dd>${escapeHtml(dbSpec.documentNumber)}</dd>
          <dt>版</dt><dd>${escapeHtml(dbSpec.version)}</dd>
          <dt>発行日</dt><dd>${escapeHtml(formatDateIso(dbSpec.issueDate))}</dd>
          <dt>DB エンジン</dt><dd>${escapeHtml(engineLabel(dbSpec.engine))}</dd>
          ${charsetRow}
          ${collationRow}
        </dl>
        ${renderPeopleList('作成者', dbSpec.authors)}
        ${renderPeopleList('レビュアー', dbSpec.reviewers)}
        ${renderRelatedDocs(dbSpec.relatedDocs)}
      </div>
    </section>
  `;

  const tables = `
    <section class="mdb-db-spec__body">
      ${dbSpec.tables.map(renderTable).join('')}
      ${renderMigrations(dbSpec.migrations)}
    </section>
  `;

  return `
    <article class="mdb-db-spec" data-schema-version="${escapeHtml(dbSpec.schema)}"${themeStyle}>
      ${cover}
      ${tables}
    </article>
  `;
}
