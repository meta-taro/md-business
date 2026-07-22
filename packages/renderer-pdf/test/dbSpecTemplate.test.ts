import { describe, it, expect } from 'vitest';
import { renderDbSpecBody } from '../src/dbSpecTemplate.js';
import { standardDbSpec, minimalDbSpec } from './dbSpecFixtures.js';

describe('renderDbSpecBody — cover page', () => {
  it('emits the document title, number, version, and issue date', () => {
    const html = renderDbSpecBody(standardDbSpec());
    expect(html).toContain('受発注システム DB 設計書');
    expect(html).toContain('DB-2026-0001');
    expect(html).toContain('1.0.0');
    expect(html).toContain('2026年06月17日');
  });

  it('renders a status badge with the localized label', () => {
    const html = renderDbSpecBody(standardDbSpec({ status: 'review' }));
    expect(html).toContain('mdb-db-spec__status--review');
    expect(html).toContain('レビュー中');
  });

  it('renders draft / approved / deprecated badge variants', () => {
    expect(renderDbSpecBody(standardDbSpec({ status: 'draft' }))).toContain('ドラフト');
    expect(renderDbSpecBody(standardDbSpec({ status: 'approved' }))).toContain('承認済');
    expect(renderDbSpecBody(standardDbSpec({ status: 'deprecated' }))).toContain('非推奨');
  });

  it('renders the localized DB engine label', () => {
    expect(renderDbSpecBody(standardDbSpec({ engine: 'postgres' }))).toContain('PostgreSQL');
    expect(renderDbSpecBody(standardDbSpec({ engine: 'mysql' }))).toContain('MySQL');
    expect(renderDbSpecBody(standardDbSpec({ engine: 'cloudsql' }))).toContain('Cloud SQL');
  });

  it('shows charset and collation when provided', () => {
    const html = renderDbSpecBody(standardDbSpec());
    expect(html).toContain('UTF8');
    expect(html).toContain('ja_JP.UTF-8');
  });

  it('omits charset / collation rows when absent', () => {
    const html = renderDbSpecBody(minimalDbSpec());
    expect(html).not.toContain('文字セット');
    expect(html).not.toContain('照合順序');
  });

  it('lists authors and reviewers with roles', () => {
    const html = renderDbSpecBody(standardDbSpec());
    expect(html).toContain('伊藤 太郎');
    expect(html).toContain('（PdM）');
    expect(html).toContain('佐藤 太郎');
    expect(html).toMatch(/レビュアー/);
  });

  it('omits the reviewers section when none are provided', () => {
    const html = renderDbSpecBody(minimalDbSpec());
    expect(html).not.toContain('レビュアー');
  });

  it('renders related docs when provided and omits when empty', () => {
    expect(renderDbSpecBody(standardDbSpec())).toContain('/docs/requirements.md');
    expect(renderDbSpecBody(standardDbSpec({ relatedDocs: [] }))).not.toContain('関連文書');
  });

  it('hides the cover page when hideCover is set', () => {
    const html = renderDbSpecBody(standardDbSpec(), { hideCover: true });
    expect(html).not.toContain('mdb-db-spec__cover');
    expect(html).not.toContain('mdb-db-spec__title');
  });
});

describe('renderDbSpecBody — tables', () => {
  it('renders a section per table with its name and description', () => {
    const html = renderDbSpecBody(standardDbSpec());
    expect(html).toContain('orders');
    expect(html).toContain('注文ヘッダ');
    expect(html).toContain('order_items');
  });

  it('renders column definitions with name and verbatim type', () => {
    const html = renderDbSpecBody(standardDbSpec());
    expect(html).toContain('customer_id');
    expect(html).toContain('numeric(12,2)');
    expect(html).toContain('timestamptz');
  });

  it('marks PK, NOT NULL, and UNIQUE columns', () => {
    const html = renderDbSpecBody(
      standardDbSpec({
        tables: [
          {
            name: 't',
            columns: [
              { name: 'id', type: 'bigint', pk: true, nullable: false },
              { name: 'email', type: 'text', unique: true, nullable: false },
              { name: 'note', type: 'text' },
            ],
          },
        ],
      }),
    );
    // PK / NOT NULL / UNIQUE markers should be present as check marks
    expect(html).toContain('mdb-db-spec__mark');
  });

  it('renders default expressions verbatim (string / number), HTML-escaped', () => {
    const html = renderDbSpecBody(standardDbSpec());
    // single quotes are HTML-escaped for safety, but the token is otherwise verbatim
    expect(html).toContain('&#39;pending&#39;');
    expect(html).toContain('now()');
  });

  it('renders foreign key references with actions', () => {
    const html = renderDbSpecBody(standardDbSpec());
    expect(html).toContain('customers.id');
    expect(html).toContain('orders.id');
    expect(html).toMatch(/CASCADE/);
    expect(html).toMatch(/RESTRICT/);
  });

  it('renders indexes when present', () => {
    const html = renderDbSpecBody(standardDbSpec());
    expect(html).toContain('idx_orders_customer');
    expect(html).toContain('uq_orders_number');
  });

  it('renders triggers when present', () => {
    const html = renderDbSpecBody(standardDbSpec());
    expect(html).toContain('trg_orders_updated');
    expect(html).toContain('BEFORE UPDATE');
    expect(html).toContain('set_updated_at()');
  });

  it('omits indexes / triggers sections for tables without them', () => {
    const html = renderDbSpecBody(minimalDbSpec());
    expect(html).not.toContain('インデックス');
    expect(html).not.toContain('トリガー');
  });

  it('keeps empty cells empty — no em-dash / N/A fillers', () => {
    const html = renderDbSpecBody(
      standardDbSpec({
        tables: [{ name: 't', columns: [{ name: 'note', type: 'text' }] }],
        migrations: [],
      }),
    );
    expect(html).not.toContain('—');
    expect(html).not.toContain('N/A');
    expect(html).not.toContain('TBD');
  });
});

describe('renderDbSpecBody — migrations', () => {
  it('lists migration ids and descriptions when present', () => {
    const html = renderDbSpecBody(standardDbSpec());
    expect(html).toContain('20260601000000_init');
    expect(html).toContain('初期スキーマ');
    expect(html).toContain('20260610093015_add_orders_note');
  });

  it('omits the migrations section when none are provided', () => {
    const html = renderDbSpecBody(minimalDbSpec());
    expect(html).not.toContain('マイグレーション');
  });
});

describe('renderDbSpecBody — theme color', () => {
  it('maps preset names to accent colors via CSS variable', () => {
    expect(renderDbSpecBody(standardDbSpec({ theme: 'red' }))).toContain('--mdb-color-accent:#b91c1c');
  });

  it('accepts custom hex colors', () => {
    expect(renderDbSpecBody(standardDbSpec({ theme: '#1e3a8a' }))).toContain('--mdb-color-accent:#1e3a8a');
  });

  it('ignores unknown / injection-like theme strings', () => {
    expect(renderDbSpecBody(standardDbSpec({ theme: 'magenta' }))).not.toContain('--mdb-color-accent');
    const evil = renderDbSpecBody(standardDbSpec({ theme: 'red;background:url(evil)' }));
    expect(evil).not.toContain('url(evil)');
    expect(evil).not.toContain('--mdb-color-accent');
  });
});

describe('renderDbSpecBody — HTML safety', () => {
  it('escapes HTML special characters in title', () => {
    const html = renderDbSpecBody(standardDbSpec({ title: '<script>alert(1)</script>' }));
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('escapes table names, column names, types, and defaults', () => {
    const html = renderDbSpecBody(
      standardDbSpec({
        tables: [
          {
            name: '<b>t</b>',
            columns: [{ name: '<i>c</i>', type: '"><svg>', default: '<img onerror=x>' }],
          },
        ],
      }),
    );
    expect(html).not.toContain('<b>t</b>');
    expect(html).not.toContain('<svg>');
    expect(html).not.toContain('<img onerror=x>');
    expect(html).toContain('&lt;b&gt;t&lt;/b&gt;');
  });

  it('sets the schema version data attribute', () => {
    const html = renderDbSpecBody(standardDbSpec());
    expect(html).toContain('data-schema-version="db-spec/v1"');
  });
});
