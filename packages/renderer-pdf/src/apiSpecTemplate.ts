import type {
  ApiSpec,
  ApiSpecAuth,
  ApiSpecBody,
  ApiSpecEndpoint,
  ApiSpecError,
  ApiSpecField,
  ApiSpecPerson,
  ApiSpecProtocol,
  ApiSpecRequest,
  ApiSpecResponse,
} from '@md-business/schema-api-spec';
import { escapeHtml } from './escape.js';
import { formatDateIso } from './format.js';

/**
 * Accent color presets — shared with the invoice / spec / db-spec / nosql-db-spec
 * templates so every document type speaks one design vocabulary. Authors can
 * pass an explicit `#rrggbb` instead of a preset name.
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

/** Display labels for the wire protocol on the cover. Unknown values fall back. */
const PROTOCOL_LABELS: Record<ApiSpecProtocol, string> = {
  rest: 'REST',
  rpc: 'RPC',
  graphql: 'GraphQL',
};

function protocolLabel(protocol: string): string {
  return PROTOCOL_LABELS[protocol as ApiSpecProtocol] ?? protocol;
}

/**
 * Authentication scheme labels. Document-level `auth` shows on the cover;
 * per-endpoint overrides reuse the same map. Unknown values fall back raw.
 */
const AUTH_LABELS: Record<ApiSpecAuth, string> = {
  none: 'なし',
  bearer: 'Bearer トークン',
  apiKey: 'API キー',
  oauth2: 'OAuth 2.0',
  basic: 'Basic 認証',
};

function authLabel(auth: string): string {
  return AUTH_LABELS[auth as ApiSpecAuth] ?? auth;
}

/**
 * Defensive recursion bound for nested `array` / `object` member shapes. The
 * schema itself allows one level of nesting (PdM decision D-α), but the renderer
 * refuses to walk past this depth to avoid a stack blow-up on a pathological (or
 * malicious) document that nests `of[]` arbitrarily.
 */
const MAX_FIELD_DEPTH = 12;

function renderPeopleList(label: string, people: ApiSpecPerson[] | undefined): string {
  if (!people || people.length === 0) return '';
  const items = people
    .map((p) => {
      const role = p.role
        ? `<span class="mdb-api-spec__role">（${escapeHtml(p.role)}）</span>`
        : '';
      return `<li>${escapeHtml(p.name)}${role}</li>`;
    })
    .join('');
  return `
    <section class="mdb-api-spec__people">
      <h2>${escapeHtml(label)}</h2>
      <ul>${items}</ul>
    </section>
  `;
}

function renderRelatedDocs(relatedDocs: string[] | undefined): string {
  if (!relatedDocs || relatedDocs.length === 0) return '';
  const items = relatedDocs.map((doc) => `<li>${escapeHtml(doc)}</li>`).join('');
  return `
    <section class="mdb-api-spec__related">
      <h2>関連文書</h2>
      <ul>${items}</ul>
    </section>
  `;
}

/** A check mark for the boolean "required" attribute. */
function mark(flag: boolean | undefined): string {
  return flag ? '<span class="mdb-api-spec__mark">✓</span>' : '';
}

/** Field type cell text. `array` surfaces its element type as `array<T>`. */
function fieldTypeLabel(field: ApiSpecField): string {
  if (field.type === 'array') {
    const element = field.of && field.of[0] ? field.of[0].type : 'unknown';
    return `array<${element}>`;
  }
  return field.type;
}

/**
 * Flatten a field list into table rows. Nested `array` element / `object` member
 * shapes (`of[]`) are emitted as deeper rows (via `data-depth`), so the whole
 * tree renders in a single table. Recursion stops at {@link MAX_FIELD_DEPTH}.
 */
function renderFieldRows(fields: ApiSpecField[], depth: number): string {
  if (depth > MAX_FIELD_DEPTH) return '';
  return fields
    .map((field) => {
      const format = field.format
        ? `<span class="mdb-api-spec__format">${escapeHtml(field.format)}</span>`
        : '';
      const dbRef = field.dbRef
        ? `<span class="mdb-api-spec__dbref"><code>${escapeHtml(field.dbRef)}</code></span>`
        : '';
      const row = `
        <tr class="mdb-api-spec__field mdb-api-spec__field--depth-${depth}" data-depth="${depth}">
          <td class="mdb-api-spec__field-name"><code>${escapeHtml(field.name)}</code></td>
          <td class="mdb-api-spec__field-type"><code>${escapeHtml(fieldTypeLabel(field))}</code>${format}</td>
          <td class="mdb-api-spec__field-flag">${mark(field.required)}</td>
          <td class="mdb-api-spec__field-desc">${field.description ? escapeHtml(field.description) : ''}${dbRef}</td>
        </tr>`;
      const children =
        field.of && field.of.length > 0 ? renderFieldRows(field.of, depth + 1) : '';
      return row + children;
    })
    .join('');
}

function renderFieldsTable(fields: ApiSpecField[]): string {
  return `
    <table class="mdb-api-spec__fields">
      <thead>
        <tr><th>フィールド</th><th>型</th><th>必須</th><th>説明</th></tr>
      </thead>
      <tbody>${renderFieldRows(fields, 0)}</tbody>
    </table>
  `;
}

function renderBody(label: string, body: ApiSpecBody | undefined): string {
  if (!body) return '';
  const fields =
    body.fields && body.fields.length > 0 ? renderFieldsTable(body.fields) : '';
  return `
    <div class="mdb-api-spec__sub">
      <h4>${escapeHtml(label)}<span class="mdb-api-spec__content-type"><code>${escapeHtml(body.contentType)}</code></span></h4>
      ${fields}
    </div>
  `;
}

function renderParamGroup(label: string, params: ApiSpecField[] | undefined): string {
  if (!params || params.length === 0) return '';
  return `
    <div class="mdb-api-spec__sub">
      <h4>${escapeHtml(label)}</h4>
      ${renderFieldsTable(params)}
    </div>
  `;
}

function renderRequest(request: ApiSpecRequest | undefined): string {
  if (!request) return '';
  const parts = [
    renderParamGroup('パスパラメータ', request.pathParams),
    renderParamGroup('クエリパラメータ', request.queryParams),
    renderParamGroup('ヘッダ', request.headers),
    renderBody('リクエストボディ', request.body),
  ]
    .filter(Boolean)
    .join('');
  if (!parts) return '';
  return `
    <div class="mdb-api-spec__request">
      <h3>リクエスト</h3>
      ${parts}
    </div>
  `;
}

function renderResponses(responses: ApiSpecResponse[]): string {
  if (!responses || responses.length === 0) return '';
  const blocks = responses
    .map((res) => {
      const desc = res.description
        ? `<span class="mdb-api-spec__response-desc">${escapeHtml(res.description)}</span>`
        : '';
      const errorRef = res.errorRef
        ? `<span class="mdb-api-spec__errorref">エラー参照: <code>${escapeHtml(res.errorRef)}</code></span>`
        : '';
      return `
        <div class="mdb-api-spec__response">
          <h4><span class="mdb-api-spec__status-code">${escapeHtml(String(res.status))}</span>${desc}${errorRef}</h4>
          ${renderBody('レスポンスボディ', res.body)}
        </div>
      `;
    })
    .join('');
  return `
    <div class="mdb-api-spec__responses">
      <h3>レスポンス</h3>
      ${blocks}
    </div>
  `;
}

/** Metadata line under the endpoint heading (operationId / auth / tags). */
function renderEndpointMeta(endpoint: ApiSpecEndpoint): string {
  const items: string[] = [];
  items.push(
    `<dt>operationId</dt><dd><code>${escapeHtml(endpoint.operationId)}</code></dd>`,
  );
  if (endpoint.auth) {
    items.push(`<dt>認証</dt><dd>${escapeHtml(authLabel(endpoint.auth))}</dd>`);
  }
  if (endpoint.tags && endpoint.tags.length > 0) {
    items.push(`<dt>タグ</dt><dd>${escapeHtml(endpoint.tags.join(', '))}</dd>`);
  }
  return `<dl class="mdb-api-spec__endpoint-meta">${items.join('')}</dl>`;
}

function renderEndpoint(endpoint: ApiSpecEndpoint): string {
  const deprecated = endpoint.deprecated
    ? '<span class="mdb-api-spec__deprecated-badge">非推奨</span>'
    : '';
  const summary = endpoint.summary
    ? `<p class="mdb-api-spec__endpoint-summary">${escapeHtml(endpoint.summary)}</p>`
    : '';
  const methodClass = `mdb-api-spec__method--${escapeHtml(endpoint.method.toLowerCase())}`;
  return `
    <section class="mdb-api-spec__endpoint">
      <h2 class="mdb-api-spec__endpoint-head">
        <span class="mdb-api-spec__method ${methodClass}">${escapeHtml(endpoint.method)}</span>
        <span class="mdb-api-spec__path"><code>${escapeHtml(endpoint.path)}</code></span>
        ${deprecated}
      </h2>
      ${summary}
      ${renderEndpointMeta(endpoint)}
      ${renderRequest(endpoint.request)}
      ${renderResponses(endpoint.responses)}
    </section>
  `;
}

function renderErrors(errors: ApiSpecError[] | undefined): string {
  if (!errors || errors.length === 0) return '';
  const rows = errors
    .map(
      (err) => `
        <tr>
          <td><code>${escapeHtml(err.code)}</code></td>
          <td>${escapeHtml(String(err.httpStatus))}</td>
          <td>${escapeHtml(err.message)}</td>
        </tr>`,
    )
    .join('');
  return `
    <section class="mdb-api-spec__errors">
      <h2>エラーカタログ</h2>
      <table class="mdb-api-spec__error-table">
        <thead>
          <tr><th>コード</th><th>HTTP</th><th>メッセージ</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </section>
  `;
}

export interface RenderApiSpecBodyOptions {
  /**
   * When true, suppress the cover page. Useful for embedding an API spec body
   * inside another document or for printing only the endpoint catalog.
   */
  hideCover?: boolean;
}

/**
 * Render the printable HTML body for an API design document.
 *
 * Layout:
 *   1. Cover page (title, status badge, version, issueDate, documentNumber,
 *      protocol, auth, baseUrl, authors, reviewers, relatedDocs).
 *   2. Endpoint catalog — one section per endpoint with its method + path,
 *      operationId / auth / tags, request parameter tables (path / query /
 *      headers / body) and responses (status, description, body, errorRef).
 *   3. Error catalog (code / httpStatus / message).
 *
 * Like the db-spec / nosql-db-spec renderers this consumes structured
 * frontmatter directly — there is no free Markdown body — so every value is
 * escaped here. Empty attributes render as empty cells
 * (docs/data-cell-conventions.md: no em-dash / N/A / TBD fillers).
 */
export function renderApiSpecBody(
  apiSpec: ApiSpec,
  options: RenderApiSpecBodyOptions = {},
): string {
  const { hideCover = false } = options;
  const themeColor = resolveThemeColor(apiSpec.theme);
  const themeStyle = themeColor ? ` style="--mdb-color-accent:${themeColor}"` : '';

  const baseUrlRow = apiSpec.baseUrl
    ? `<dt>ベース URL</dt><dd><code>${escapeHtml(apiSpec.baseUrl)}</code></dd>`
    : '';

  const cover = hideCover
    ? ''
    : `
    <section class="mdb-api-spec__cover">
      <div class="mdb-api-spec__cover-inner">
        <div class="mdb-api-spec__status mdb-api-spec__status--${escapeHtml(apiSpec.status)}">${escapeHtml(statusLabel(apiSpec.status))}</div>
        <h1 class="mdb-api-spec__title">${escapeHtml(apiSpec.title)}</h1>
        <dl class="mdb-api-spec__meta">
          <dt>文書番号</dt><dd>${escapeHtml(apiSpec.documentNumber)}</dd>
          <dt>版</dt><dd>${escapeHtml(apiSpec.version)}</dd>
          <dt>発行日</dt><dd>${escapeHtml(formatDateIso(apiSpec.issueDate))}</dd>
          <dt>プロトコル</dt><dd>${escapeHtml(protocolLabel(apiSpec.protocol))}</dd>
          <dt>認証</dt><dd>${escapeHtml(authLabel(apiSpec.auth))}</dd>
          ${baseUrlRow}
        </dl>
        ${renderPeopleList('作成者', apiSpec.authors)}
        ${renderPeopleList('レビュアー', apiSpec.reviewers)}
        ${renderRelatedDocs(apiSpec.relatedDocs)}
      </div>
    </section>
  `;

  const body = `
    <section class="mdb-api-spec__body">
      ${apiSpec.endpoints.map(renderEndpoint).join('')}
      ${renderErrors(apiSpec.errors)}
    </section>
  `;

  return `
    <article class="mdb-api-spec" data-schema-version="${escapeHtml(apiSpec.schema)}"${themeStyle}>
      ${cover}
      ${body}
    </article>
  `;
}
