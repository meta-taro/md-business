import { describe, expect, it } from 'vitest';
import yaml from 'js-yaml';

import {
  extractFrontmatter,
  replaceFrontmatter,
  appendColumnToFrontmatter,
  removeLastColumnFromFrontmatter,
  applyTestSpecTemplate,
} from '../src/lib/frontmatterEdit.js';

const SAMPLE = [
  '---',
  'schema: test-spec/v1',
  'documentNumber: TEST-2026-0001',
  'title: ログイン機能 検証シート',
  'issueDate: 2026-06-19',
  'authors:',
  '  - { name: 田中, role: PdM }',
  'columns:',
  '  - { name: 項目, type: text }',
  '  - { name: 結果, type: enum, values: [OK, NG] }',
  '---',
  '',
  '| 項目 | 結果 |',
  '| --- | --- |',
  '| ログイン成功 | OK |',
].join('\n');

describe('extractFrontmatter', () => {
  it('splits a markdown with frontmatter into yaml + body', () => {
    const { yaml: y, body } = extractFrontmatter(SAMPLE);
    expect(y).toContain('schema: test-spec/v1');
    expect(y).toContain('columns:');
    expect(body).toContain('| ログイン成功 | OK |');
    expect(y).not.toMatch(/^---/);
  });

  it('returns empty yaml when no frontmatter is present', () => {
    const { yaml: y, body } = extractFrontmatter('# just a heading\n');
    expect(y).toBe('');
    expect(body).toBe('# just a heading\n');
  });

  it('tolerates CRLF line endings', () => {
    const src = '---\r\nschema: test-spec/v1\r\n---\r\nbody\r\n';
    const { yaml: y, body } = extractFrontmatter(src);
    expect(y).toContain('schema: test-spec/v1');
    expect(body).toContain('body');
  });
});

describe('replaceFrontmatter', () => {
  it('replaces an existing frontmatter block, keeping the body', () => {
    const out = replaceFrontmatter(SAMPLE, 'schema: test-spec/v1\ncolumns: []');
    expect(out.startsWith('---\nschema: test-spec/v1\ncolumns: []\n---')).toBe(true);
    expect(out).toContain('| ログイン成功 | OK |');
  });

  it('prepends a frontmatter block when source has none', () => {
    const out = replaceFrontmatter('body only', 'schema: test-spec/v1');
    expect(out.startsWith('---\nschema: test-spec/v1\n---')).toBe(true);
    expect(out).toContain('body only');
  });
});

describe('appendColumnToFrontmatter', () => {
  it('appends a new text column at the end of columns array', () => {
    const r = appendColumnToFrontmatter(SAMPLE, { name: '備考', type: 'text' });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('unexpected failure');
    const { yaml: y } = extractFrontmatter(r.newSrc);
    const parsed = yaml.load(y) as { columns: Array<{ name: string; type: string }> };
    expect(parsed.columns).toHaveLength(3);
    expect(parsed.columns[2]).toEqual({ name: '備考', type: 'text' });
  });

  it('appends a column with values for enum type', () => {
    const r = appendColumnToFrontmatter(SAMPLE, {
      name: '優先度',
      type: 'enum',
      values: ['高', '中', '低'],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('unexpected failure');
    const parsed = yaml.load(extractFrontmatter(r.newSrc).yaml) as {
      columns: Array<{ name: string; type: string; values?: string[] }>;
    };
    expect(parsed.columns[2]?.values).toEqual(['高', '中', '低']);
  });

  it('creates columns array when frontmatter has no columns key', () => {
    const src = '---\nschema: test-spec/v1\n---\nbody';
    const r = appendColumnToFrontmatter(src, { name: '項目', type: 'text' });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('unexpected failure');
    const parsed = yaml.load(extractFrontmatter(r.newSrc).yaml) as {
      columns: Array<{ name: string; type: string }>;
    };
    expect(parsed.columns).toEqual([{ name: '項目', type: 'text' }]);
  });

  it('creates a minimal frontmatter when source has none', () => {
    const r = appendColumnToFrontmatter('body only', { name: '項目', type: 'text' });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('unexpected failure');
    const { yaml: y, body } = extractFrontmatter(r.newSrc);
    expect(y).toContain('columns:');
    expect(body).toContain('body only');
  });

  it('rejects an unknown column type', () => {
    const r = appendColumnToFrontmatter(SAMPLE, {
      name: 'x',
      // @ts-expect-error intentionally invalid
      type: 'banana',
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unexpected success');
    expect(r.error).toMatch(/type/);
  });

  it('rejects when name is blank', () => {
    const r = appendColumnToFrontmatter(SAMPLE, { name: '', type: 'text' });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unexpected success');
    expect(r.error).toMatch(/name/);
  });
});

describe('removeLastColumnFromFrontmatter', () => {
  it('removes the last column from columns array', () => {
    const r = removeLastColumnFromFrontmatter(SAMPLE);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('unexpected failure');
    const parsed = yaml.load(extractFrontmatter(r.newSrc).yaml) as {
      columns: Array<{ name: string }>;
    };
    expect(parsed.columns).toHaveLength(1);
    expect(parsed.columns[0]?.name).toBe('項目');
  });

  it('returns ok with unchanged columns when columns is empty', () => {
    const src = '---\nschema: test-spec/v1\ncolumns: []\n---\nbody';
    const r = removeLastColumnFromFrontmatter(src);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('unexpected failure');
    const parsed = yaml.load(extractFrontmatter(r.newSrc).yaml) as { columns: unknown[] };
    expect(parsed.columns).toEqual([]);
  });

  it('returns error when source has no frontmatter at all', () => {
    const r = removeLastColumnFromFrontmatter('body only');
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unexpected success');
    expect(r.error).toMatch(/frontmatter/);
  });
});

describe('applyTestSpecTemplate', () => {
  it('returns a minimal valid frontmatter with one text column for "minimal"', () => {
    const out = applyTestSpecTemplate('minimal');
    const { yaml: y, body } = extractFrontmatter(out);
    const parsed = yaml.load(y) as {
      schema: string;
      documentNumber: string;
      title: string;
      issueDate: string;
      authors: Array<{ name: string }>;
      columns: Array<{ name: string; type: string }>;
    };
    expect(parsed.schema).toBe('test-spec/v1');
    expect(parsed.columns).toHaveLength(1);
    expect(parsed.columns[0]?.type).toBe('text');
    expect(typeof parsed.documentNumber).toBe('string');
    expect(parsed.documentNumber.length).toBeGreaterThan(0);
    expect(body).toBe('');
  });

  it('returns a full template with enum + visual styles for "full"', () => {
    const out = applyTestSpecTemplate('full');
    const { yaml: y } = extractFrontmatter(out);
    const parsed = yaml.load(y) as {
      columns: Array<{
        name: string;
        type: string;
        values?: string[];
        visual?: Record<string, unknown>;
      }>;
    };
    const enumCol = parsed.columns.find((c) => c.type === 'enum');
    expect(enumCol).toBeDefined();
    expect(enumCol?.values?.length).toBeGreaterThan(0);
    expect(enumCol?.visual).toBeDefined();
  });

  it('returns an empty string for "clear"', () => {
    expect(applyTestSpecTemplate('clear')).toBe('');
  });
});
