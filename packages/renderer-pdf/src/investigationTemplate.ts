import type {
  Investigation,
  InvestigationFinding,
  InvestigationPerson,
  InvestigationTarget,
  InvestigationTool,
} from '@md-business/schema-investigation';
import { escapeHtml } from './escape.js';

/**
 * Accent color presets — shared with the other document templates so every
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
  investigating: '調査中',
  concluded: '結論あり',
  suspended: '中断',
};

const KIND_LABELS: Record<string, string> = {
  log: 'ログ調査',
  network: '通信調査',
};

const SEVERITY_LABELS: Record<string, string> = {
  high: '高',
  medium: '中',
  low: '低',
  info: '参考',
};

function renderPeopleList(label: string, people: InvestigationPerson[] | undefined): string {
  if (!people || people.length === 0) return '';
  const items = people
    .map((p) => {
      const role = p.role
        ? `<span class="mdb-investigation__role">（${escapeHtml(p.role)}）</span>`
        : '';
      return `<li>${escapeHtml(p.name)}${role}</li>`;
    })
    .join('');
  return `
    <section class="mdb-investigation__people">
      <h2>${escapeHtml(label)}</h2>
      <ul>${items}</ul>
    </section>
  `;
}

function renderRelatedDocs(relatedDocs: string[] | undefined): string {
  if (!relatedDocs || relatedDocs.length === 0) return '';
  const items = relatedDocs.map((doc) => `<li><code>${escapeHtml(doc)}</code></li>`).join('');
  return `
    <section class="mdb-investigation__related">
      <h2>関連文書</h2>
      <ul>${items}</ul>
    </section>
  `;
}

/**
 * The files the investigation actually read.
 *
 * The digest is printed in full. It is the only way to tell later whether the
 * file at that path is still the one that was examined, and a shortened digest
 * cannot answer that question.
 */
function renderTargets(targets: InvestigationTarget[]): string {
  const rows = targets
    .map(
      (t) => `
        <tr>
          <td class="mdb-investigation__target-path"><code>${escapeHtml(t.path)}</code></td>
          <td class="mdb-investigation__target-hash"><code>${escapeHtml(t.sha256)}</code></td>
          <td class="mdb-investigation__target-note">${t.note ? escapeHtml(t.note) : ''}</td>
        </tr>`,
    )
    .join('');
  return `
    <section class="mdb-investigation__targets">
      <h2>調べた対象</h2>
      <table>
        <thead><tr><th>パス</th><th>SHA-256</th><th>備考</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </section>
  `;
}

/** 名前と版は必ず組で出す。版が違えば同じ操作でも結果が変わりうる。 */
function renderTools(tools: InvestigationTool[]): string {
  const items = tools
    .map(
      (t) =>
        `<li><span class="mdb-investigation__tool-name">${escapeHtml(t.name)}</span> <code class="mdb-investigation__tool-version">${escapeHtml(t.version)}</code></li>`,
    )
    .join('');
  return `
    <section class="mdb-investigation__tools">
      <h2>使った道具</h2>
      <ul>${items}</ul>
    </section>
  `;
}

function renderFinding(finding: InvestigationFinding): string {
  const severity = finding.severity;
  const badge = severity
    ? `<span class="mdb-investigation__severity mdb-investigation__severity--${escapeHtml(severity)}">${escapeHtml(SEVERITY_LABELS[severity] ?? severity)}</span>`
    : '';
  const evidence = finding.evidence
    .map((ref) => `<li><code>${escapeHtml(ref)}</code></li>`)
    .join('');
  return `
    <section class="mdb-investigation__finding">
      <h3>
        <span class="mdb-investigation__finding-id">${escapeHtml(finding.id)}</span>
        ${badge}
      </h3>
      <p class="mdb-investigation__finding-summary">${escapeHtml(finding.summary)}</p>
      <div class="mdb-investigation__evidence">
        <h4>根拠</h4>
        <ul>${evidence}</ul>
      </div>
    </section>
  `;
}

/**
 * Findings, each with the evidence it rests on.
 *
 * The schema refuses a finding without evidence. Dropping the references at
 * render time would make that constraint pointless for anyone reading the
 * printed report.
 */
function renderFindings(findings: InvestigationFinding[] | undefined): string {
  if (!findings || findings.length === 0) return '';
  return `
    <section class="mdb-investigation__findings">
      <h2>所見</h2>
      ${findings.map(renderFinding).join('')}
    </section>
  `;
}

function renderSummary(summary: string | undefined): string {
  if (!summary) return '';
  return `
    <section class="mdb-investigation__summary">
      <h2>要約</h2>
      <p>${escapeHtml(summary)}</p>
    </section>
  `;
}

export interface RenderInvestigationBodyOptions {
  /**
   * Pre-rendered HTML for the Markdown body — the narrative part of the report
   * (how the investigation was run, what it concluded). The md→HTML step and
   * its sanitizing belong to the viewer, not to the print renderer.
   */
  bodyHtml?: string;
  /** When true, suppress the cover page (for embedding the body elsewhere). */
  hideCover?: boolean;
}

/**
 * Render the printable HTML body for an investigation report.
 *
 * Layout:
 *   1. Cover — status badge, title, kind, document number, createdAt, the time
 *      window that was examined, authors, reviewers, related documents.
 *   2. Targets — path + full SHA-256 + note.
 *   3. Tools — name and version, always paired.
 *   4. Summary.
 *   5. Findings — id, severity, statement, and the evidence references.
 *   6. Body — the narrative (pre-rendered HTML), when the caller supplies one.
 *
 * Timestamps are printed exactly as written. Reformatting them would break the
 * reader's ability to line the report up against the log it came from, and any
 * timezone math here would silently shift that correspondence.
 *
 * Empty optional attributes render as empty cells, never as a filler string
 * (docs/data-cell-conventions.md).
 */
export function renderInvestigationBody(
  investigation: Investigation,
  options: RenderInvestigationBodyOptions = {},
): string {
  const { bodyHtml = '', hideCover = false } = options;
  const themeColor = resolveThemeColor(investigation.theme);
  const themeStyle = themeColor ? ` style="--mdb-color-accent:${themeColor}"` : '';
  const status = investigation.status;
  const kindLabel = KIND_LABELS[investigation.kind] ?? investigation.kind;

  const cover = hideCover
    ? ''
    : `
    <section class="mdb-investigation__cover">
      <div class="mdb-investigation__cover-inner">
        <div class="mdb-investigation__status mdb-investigation__status--${escapeHtml(status)}">${escapeHtml(STATUS_LABELS[status] ?? status)}</div>
        <h1 class="mdb-investigation__title">${escapeHtml(investigation.title)}</h1>
        <dl class="mdb-investigation__meta">
          <dt>種別</dt><dd>${escapeHtml(kindLabel)}</dd>
          <dt>文書番号</dt><dd>${escapeHtml(investigation.documentNumber)}</dd>
          <dt>作成日時</dt><dd><time>${escapeHtml(investigation.createdAt)}</time></dd>
          <dt>調査した時間帯</dt>
          <dd>
            <time>${escapeHtml(investigation.window.from)}</time>
            〜
            <time>${escapeHtml(investigation.window.to)}</time>
          </dd>
        </dl>
        ${renderPeopleList('作成者', investigation.authors)}
        ${renderPeopleList('レビュアー', investigation.reviewers)}
        ${renderRelatedDocs(investigation.relatedDocs)}
      </div>
    </section>
  `;

  // 経緯・調べ方・結論は本文にしか無い。所見の一覧はその索引なので、本文は
  // 所見の後ろに続けて置く。
  const prose = bodyHtml ? `<section class="mdb-investigation__prose">${bodyHtml}</section>` : '';

  const body = `
    <section class="mdb-investigation__body">
      ${renderTargets(investigation.targets)}
      ${renderTools(investigation.tools)}
      ${renderSummary(investigation.summary)}
      ${renderFindings(investigation.findings)}
      ${prose}
    </section>
  `;

  return `
    <article class="mdb-investigation" data-schema-version="${escapeHtml(investigation.schema)}"${themeStyle}>
      ${cover}
      ${body}
    </article>
  `;
}
