import type {
  DocIdStrategy,
  NosqlCollection,
  NosqlDbSpec,
  NosqlDbSpecPerson,
  NosqlFieldDef,
  NosqlIndex,
  NosqlSecurityRule,
  NosqlShape,
  NosqlTtl,
} from '@md-business/schema-nosql-db-spec';
import { escapeHtml } from './escape.js';
import { formatDateIso } from './format.js';

/**
 * Accent color presets — shared with the invoice / spec / db-spec templates so
 * every document type speaks one design vocabulary. Authors can pass an
 * explicit `#rrggbb` instead of a preset name.
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
 * Display labels for NoSQL engines. The stored value is the normalized enum
 * (`firestore` / `dynamodb` / …); the renderer maps it to a human-facing brand
 * name for the cover. Unknown values fall back to the raw string.
 */
const ENGINE_LABELS: Record<string, string> = {
  firestore: 'Cloud Firestore',
  dynamodb: 'Amazon DynamoDB',
  mongodb: 'MongoDB',
  cosmosdb: 'Azure Cosmos DB',
  redis: 'Redis',
  documentdb: 'Amazon DocumentDB',
  'turso-document': 'Turso (Document)',
};

function engineLabel(engine: string): string {
  return ENGINE_LABELS[engine] ?? engine;
}

/**
 * Engine-agnostic document ID strategy labels (schema decision C-1/C-5).
 * `composite` documents also surface `partitionKeyField` / `sortKeyField`.
 */
const DOC_ID_STRATEGY_LABELS: Record<DocIdStrategy, string> = {
  uuid: 'UUID（クライアント生成）',
  auto: '自動採番（エンジン ID）',
  'auth-uid': '認証 UID',
  composite: '複合キー（パーティション + ソート）',
};

function docIdStrategyLabel(strategy: DocIdStrategy): string {
  return DOC_ID_STRATEGY_LABELS[strategy] ?? strategy;
}

/**
 * Defensive recursion bound for nested `map` / `array<map>` shapes. The schema
 * itself is unbounded by design, but the renderer refuses to walk past this
 * depth to avoid a stack blow-up on a pathological (or malicious) document.
 */
const MAX_FIELD_DEPTH = 12;

function renderPeopleList(label: string, people: NosqlDbSpecPerson[] | undefined): string {
  if (!people || people.length === 0) return '';
  const items = people
    .map((p) => {
      const role = p.role
        ? `<span class="mdb-nosql-db-spec__role">（${escapeHtml(p.role)}）</span>`
        : '';
      return `<li>${escapeHtml(p.name)}${role}</li>`;
    })
    .join('');
  return `
    <section class="mdb-nosql-db-spec__people">
      <h2>${escapeHtml(label)}</h2>
      <ul>${items}</ul>
    </section>
  `;
}

function renderRelatedDocs(relatedDocs: string[] | undefined): string {
  if (!relatedDocs || relatedDocs.length === 0) return '';
  const items = relatedDocs.map((doc) => `<li>${escapeHtml(doc)}</li>`).join('');
  return `
    <section class="mdb-nosql-db-spec__related">
      <h2>関連文書</h2>
      <ul>${items}</ul>
    </section>
  `;
}

/** A check mark for the boolean "required" attribute. */
function mark(flag: boolean | undefined): string {
  return flag ? '<span class="mdb-nosql-db-spec__mark">✓</span>' : '';
}

/** Field type cell text. `array` surfaces its element type as `array<T>`. */
function fieldTypeLabel(field: NosqlFieldDef): string {
  if (field.type === 'array') {
    const element = field.of ? field.of.type : 'unknown';
    return `array<${element}>`;
  }
  return field.type;
}

function renderEnumHint(values: Array<string | number> | undefined): string {
  if (!values || values.length === 0) return '';
  return `<span class="mdb-nosql-db-spec__enum">${escapeHtml(values.map(String).join(' | '))}</span>`;
}

/** Render a default value verbatim. Empty when unset (never a filler token). */
function renderDefault(value: NosqlFieldDef['default']): string {
  if (value === undefined) return '';
  return `<code>${escapeHtml(String(value))}</code>`;
}

/**
 * Flatten a recursive document shape into table rows. Nested `map` fields and
 * `array<map>` element fields are emitted as deeper rows (via `data-depth`),
 * so the whole tree renders in a single table. Recursion stops at
 * {@link MAX_FIELD_DEPTH}.
 */
function renderFieldRows(shape: NosqlShape, depth: number): string {
  if (depth > MAX_FIELD_DEPTH) return '';
  return Object.entries(shape)
    .map(([name, field]) => {
      const row = `
        <tr class="mdb-nosql-db-spec__field mdb-nosql-db-spec__field--depth-${depth}" data-depth="${depth}">
          <td class="mdb-nosql-db-spec__field-name"><code>${escapeHtml(name)}</code></td>
          <td class="mdb-nosql-db-spec__field-type"><code>${escapeHtml(fieldTypeLabel(field))}</code></td>
          <td class="mdb-nosql-db-spec__field-flag">${mark(field.required)}</td>
          <td class="mdb-nosql-db-spec__field-default">${renderDefault(field.default)}</td>
          <td class="mdb-nosql-db-spec__field-enum">${renderEnumHint(field.enum)}</td>
          <td class="mdb-nosql-db-spec__field-desc">${field.description ? escapeHtml(field.description) : ''}</td>
        </tr>`;
      let children = '';
      if (field.type === 'map' && field.shape) {
        children = renderFieldRows(field.shape, depth + 1);
      } else if (field.type === 'array' && field.of?.type === 'map' && field.of.shape) {
        children = renderFieldRows(field.of.shape, depth + 1);
      }
      return row + children;
    })
    .join('');
}

function renderFieldsTable(shape: NosqlShape): string {
  return `
    <table class="mdb-nosql-db-spec__fields">
      <thead>
        <tr><th>フィールド</th><th>型</th><th>必須</th><th>デフォルト</th><th>enum</th><th>説明</th></tr>
      </thead>
      <tbody>${renderFieldRows(shape, 0)}</tbody>
    </table>
  `;
}

function ttlState(ttl: NosqlTtl): string {
  if (ttl.enabled === false) return '（無効）';
  if (ttl.enabled === true) return '（有効）';
  return '';
}

function renderCollectionMeta(collection: NosqlCollection): string {
  const items: string[] = [];
  items.push(
    `<dt>ドキュメント ID</dt><dd>${escapeHtml(docIdStrategyLabel(collection.docIdStrategy))}</dd>`,
  );
  if (collection.partitionKeyField) {
    items.push(
      `<dt>パーティションキー</dt><dd><code>${escapeHtml(collection.partitionKeyField)}</code></dd>`,
    );
  }
  if (collection.sortKeyField) {
    items.push(`<dt>ソートキー</dt><dd><code>${escapeHtml(collection.sortKeyField)}</code></dd>`);
  }
  if (collection.ttl) {
    items.push(
      `<dt>TTL</dt><dd><code>${escapeHtml(collection.ttl.field)}</code>${ttlState(collection.ttl)}</dd>`,
    );
  }
  return `<dl class="mdb-nosql-db-spec__collection-meta">${items.join('')}</dl>`;
}

function renderIndexes(indexes: NosqlIndex[] | undefined): string {
  if (!indexes || indexes.length === 0) return '';
  const rows = indexes
    .map(
      (idx) => `
        <tr>
          <td>${escapeHtml(idx.fields.join(', '))}</td>
          <td>${idx.scope ? escapeHtml(idx.scope) : ''}</td>
          <td>${idx.mode ? escapeHtml(idx.mode) : ''}</td>
        </tr>`,
    )
    .join('');
  return `
    <div class="mdb-nosql-db-spec__sub">
      <h4>インデックス</h4>
      <table class="mdb-nosql-db-spec__indexes">
        <thead>
          <tr><th>対象フィールド</th><th>スコープ</th><th>並び</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function renderCollection(collection: NosqlCollection): string {
  const description = collection.description
    ? `<p class="mdb-nosql-db-spec__collection-desc">${escapeHtml(collection.description)}</p>`
    : '';
  return `
    <section class="mdb-nosql-db-spec__collection">
      <h3 class="mdb-nosql-db-spec__collection-path"><code>${escapeHtml(collection.path)}</code></h3>
      ${description}
      ${renderCollectionMeta(collection)}
      ${renderFieldsTable(collection.shape)}
      ${renderIndexes(collection.indexes)}
    </section>
  `;
}

function renderSecurityRules(rules: NosqlSecurityRule[] | undefined): string {
  if (!rules || rules.length === 0) return '';
  const rows = rules
    .map(
      (rule) => `
        <tr>
          <td><code>${escapeHtml(rule.match)}</code></td>
          <td>${escapeHtml(rule.allow.join(', '))}</td>
          <td>${rule.if ? `<code>${escapeHtml(rule.if)}</code>` : ''}</td>
        </tr>`,
    )
    .join('');
  return `
    <section class="mdb-nosql-db-spec__security">
      <h2>セキュリティルール</h2>
      <table class="mdb-nosql-db-spec__security-rules">
        <thead>
          <tr><th>match</th><th>許可</th><th>条件</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </section>
  `;
}

export interface RenderNosqlDbSpecBodyOptions {
  /**
   * When true, suppress the cover page. Useful for embedding a NoSQL spec body
   * inside another document or for printing only the collection catalog.
   */
  hideCover?: boolean;
}

/**
 * Render the printable HTML body for a NoSQL (document-store) design document.
 *
 * Layout:
 *   1. Cover page (title, status badge, version, issueDate, documentNumber,
 *      engine, multiRegion, authors, reviewers, relatedDocs).
 *   2. Collection catalog — one section per collection with its path, document
 *      ID strategy, composite partition/sort keys, TTL, a recursive field
 *      table (nested `map` / `array<map>` shapes flattened by depth), and
 *      optional indexes.
 *   3. Security rules digest (match / allow / condition).
 *
 * Like the db-spec renderer this consumes structured frontmatter directly —
 * there is no free Markdown body — so every value is escaped here. Empty
 * attributes render as empty cells (docs/data-cell-conventions.md: no em-dash
 * / N/A / TBD fillers).
 */
export function renderNosqlDbSpecBody(
  nosqlDbSpec: NosqlDbSpec,
  options: RenderNosqlDbSpecBodyOptions = {},
): string {
  const { hideCover = false } = options;
  const themeColor = resolveThemeColor(nosqlDbSpec.theme);
  const themeStyle = themeColor ? ` style="--mdb-color-accent:${themeColor}"` : '';

  const regionRow = nosqlDbSpec.multiRegion
    ? `<dt>リージョン</dt><dd>${escapeHtml(nosqlDbSpec.multiRegion)}</dd>`
    : '';

  const cover = hideCover
    ? ''
    : `
    <section class="mdb-nosql-db-spec__cover">
      <div class="mdb-nosql-db-spec__cover-inner">
        <div class="mdb-nosql-db-spec__status mdb-nosql-db-spec__status--${escapeHtml(nosqlDbSpec.status)}">${escapeHtml(statusLabel(nosqlDbSpec.status))}</div>
        <h1 class="mdb-nosql-db-spec__title">${escapeHtml(nosqlDbSpec.title)}</h1>
        <dl class="mdb-nosql-db-spec__meta">
          <dt>文書番号</dt><dd>${escapeHtml(nosqlDbSpec.documentNumber)}</dd>
          <dt>版</dt><dd>${escapeHtml(nosqlDbSpec.version)}</dd>
          <dt>発行日</dt><dd>${escapeHtml(formatDateIso(nosqlDbSpec.issueDate))}</dd>
          <dt>エンジン</dt><dd>${escapeHtml(engineLabel(nosqlDbSpec.engine))}</dd>
          ${regionRow}
        </dl>
        ${renderPeopleList('作成者', nosqlDbSpec.authors)}
        ${renderPeopleList('レビュアー', nosqlDbSpec.reviewers)}
        ${renderRelatedDocs(nosqlDbSpec.relatedDocs)}
      </div>
    </section>
  `;

  const body = `
    <section class="mdb-nosql-db-spec__body">
      ${nosqlDbSpec.collections.map(renderCollection).join('')}
      ${renderSecurityRules(nosqlDbSpec.securityRules)}
    </section>
  `;

  return `
    <article class="mdb-nosql-db-spec" data-schema-version="${escapeHtml(nosqlDbSpec.schema)}"${themeStyle}>
      ${cover}
      ${body}
    </article>
  `;
}
