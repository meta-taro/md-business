import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { parseAndValidate } from '@md-business/core/runtime';
import { testSpecSchema, SCHEMA_VERSION, normalizeTestSpecFrontmatter } from '../src/index.js';
import type { TestSpec } from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const templatesDir = resolve(here, '../../../templates/test-spec');

function loadTemplate(name: string): string {
  return readFileSync(resolve(templatesDir, name), 'utf8');
}

const ajv = new (Ajv2020 as unknown as typeof import('ajv').default)({ allErrors: true, strict: false });
(addFormats as unknown as (ajv: unknown) => void)(ajv);
const validateTestSpec = ajv.compile(testSpecSchema);

function buildTestSpec(): Record<string, unknown> {
  return {
    schema: 'test-spec/v1',
    documentNumber: 'TEST-2026-001',
    title: 'ログイン機能 検証シート',
    version: '0.1.0',
    issueDate: '2026-06-18',
    status: 'draft',
    authors: [{ name: '田中', role: 'QA Lead' }],
    columns: [
      { name: '項目', type: 'text' },
      { name: '手順', type: 'multiline_text' },
      {
        name: '結果',
        type: 'enum',
        values: ['OK', 'NG', '保留'],
        visual: {
          OK: { row_background: '#e6f4ea' },
          NG: { row_background: '#fce8e6' },
          保留: { background: '#fef7e0' },
        },
      },
    ],
  };
}

function toFrontmatter(data: Record<string, unknown>): string {
  const yaml = Object.entries(data)
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    .join('\n');
  return `---\n${yaml}\n---\n`;
}

describe('templates/test-spec/standard-ja.md', () => {
  it('parses, normalizes and passes schema validation (OSS template must be ajv-valid as-shipped)', () => {
    const raw = loadTemplate('standard-ja.md');
    const result = parseAndValidate<Record<string, unknown>>(raw, { type: 'object' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { data, warnings } = normalizeTestSpecFrontmatter(result.frontmatter);
    expect(warnings).toEqual([]);
    const valid = validateTestSpec(data);
    if (!valid) {
      console.error('templates/test-spec/standard-ja.md validation errors:', validateTestSpec.errors);
    }
    expect(valid).toBe(true);
  });
});

describe('testSpecSchema constants', () => {
  it('exports the schema as an object', () => {
    expect(typeof testSpecSchema).toBe('object');
  });

  it('exposes SCHEMA_VERSION constant', () => {
    expect(SCHEMA_VERSION).toBe('test-spec/v1');
  });
});

describe('testSpecSchema — happy path', () => {
  it('validates a minimal complete test-spec', () => {
    const result = parseAndValidate<TestSpec>(toFrontmatter(buildTestSpec()), testSpecSchema);
    expect(result.ok).toBe(true);
  });

  it('accepts optional reviewers, relatedDocs, googleSheetId, theme, fileName', () => {
    const data = {
      ...buildTestSpec(),
      reviewers: [{ name: '佐藤' }],
      relatedDocs: ['./PRD.md'],
      googleSheetId: '1AbcD_ExampleSheetId',
      theme: 'blue',
      fileName: '{documentNumber}-{title}.pdf',
    };
    const result = parseAndValidate<TestSpec>(toFrontmatter(data), testSpecSchema);
    expect(result.ok).toBe(true);
  });

  it.each([
    ['meta-taro/md-business@main:verify/login.md'],
    ['meta-taro/md-business:verify/login.md'],
    ['o/r@feat/test-spec:verify.md'],
    ['o/r@main:nested/dir/file.md'],
  ])('accepts repository ref %s', (repository) => {
    const data = { ...buildTestSpec(), repository };
    const result = parseAndValidate<TestSpec>(toFrontmatter(data), testSpecSchema);
    expect(result.ok).toBe(true);
  });

  it.each([
    ['meta-taro/md-business@main'],
    ['meta-taro/md-business@main:'],
    ['@main:x.md'],
    ['owneronly@main:x.md'],
    [''],
    ['meta-taro/md-business@main:has space.md'],
  ])('rejects malformed repository ref %s', (repository) => {
    const data = { ...buildTestSpec(), repository };
    const result = parseAndValidate<TestSpec>(toFrontmatter(data), testSpecSchema);
    expect(result.ok).toBe(false);
  });

  it('accepts all 7 column types', () => {
    const data = {
      ...buildTestSpec(),
      columns: [
        { name: 'A', type: 'text' },
        { name: 'B', type: 'multiline_text' },
        { name: 'C', type: 'enum', values: ['x'] },
        { name: 'D', type: 'date' },
        { name: 'E', type: 'number', min: 0, max: 100 },
        { name: 'F', type: 'checkbox' },
        { name: 'G', type: 'url' },
      ],
    };
    const result = parseAndValidate<TestSpec>(toFrontmatter(data), testSpecSchema);
    expect(result.ok).toBe(true);
  });

  it('accepts optional column-level required / widthScale / wrap', () => {
    const data = {
      ...buildTestSpec(),
      columns: [
        { name: '項目', type: 'text', widthScale: 1.5, wrap: true },
        { name: '実施日', type: 'date', required: false, widthScale: 1.2 },
        { name: '担当', type: 'text', required: false, wrap: false },
        { name: '備考', type: 'multiline_text', widthScale: 3 },
      ],
    };
    const result = parseAndValidate<TestSpec>(toFrontmatter(data), testSpecSchema);
    expect(result.ok).toBe(true);
  });
});

describe('testSpecSchema — error cases', () => {
  it('rejects a wrong schema constant', () => {
    const data = buildTestSpec();
    data['schema'] = 'test-spec/v2';
    const result = parseAndValidate<TestSpec>(toFrontmatter(data), testSpecSchema);
    expect(result.ok).toBe(false);
  });

  it('rejects a non-SemVer version', () => {
    const data = buildTestSpec();
    data['version'] = '0.1';
    const result = parseAndValidate<TestSpec>(toFrontmatter(data), testSpecSchema);
    expect(result.ok).toBe(false);
  });

  it('rejects a non-ISO issueDate', () => {
    const data = buildTestSpec();
    data['issueDate'] = '2026/06/18';
    const result = parseAndValidate<TestSpec>(toFrontmatter(data), testSpecSchema);
    expect(result.ok).toBe(false);
  });

  it('rejects an unknown status value', () => {
    const data = buildTestSpec();
    data['status'] = 'archived';
    const result = parseAndValidate<TestSpec>(toFrontmatter(data), testSpecSchema);
    expect(result.ok).toBe(false);
  });

  it('rejects an empty authors array', () => {
    const data = buildTestSpec();
    (data['authors'] as unknown[]) = [];
    const result = parseAndValidate<TestSpec>(toFrontmatter(data), testSpecSchema);
    expect(result.ok).toBe(false);
  });

  it('rejects an empty columns array', () => {
    const data = buildTestSpec();
    (data['columns'] as unknown[]) = [];
    const result = parseAndValidate<TestSpec>(toFrontmatter(data), testSpecSchema);
    expect(result.ok).toBe(false);
  });

  it('rejects an unknown column type', () => {
    const data = buildTestSpec();
    (data['columns'] as Array<Record<string, unknown>>)[0] = { name: 'X', type: 'guid' };
    const result = parseAndValidate<TestSpec>(toFrontmatter(data), testSpecSchema);
    expect(result.ok).toBe(false);
  });

  it('rejects type=enum without values', () => {
    const data = buildTestSpec();
    (data['columns'] as Array<Record<string, unknown>>)[0] = { name: 'X', type: 'enum' };
    const result = parseAndValidate<TestSpec>(toFrontmatter(data), testSpecSchema);
    expect(result.ok).toBe(false);
  });

  it('rejects widthScale below 0.1', () => {
    const data = buildTestSpec();
    (data['columns'] as Array<Record<string, unknown>>)[0] = {
      name: '項目',
      type: 'text',
      widthScale: 0.05,
    };
    const result = parseAndValidate<TestSpec>(toFrontmatter(data), testSpecSchema);
    expect(result.ok).toBe(false);
  });

  it('rejects widthScale above 10', () => {
    const data = buildTestSpec();
    (data['columns'] as Array<Record<string, unknown>>)[0] = {
      name: '項目',
      type: 'text',
      widthScale: 11,
    };
    const result = parseAndValidate<TestSpec>(toFrontmatter(data), testSpecSchema);
    expect(result.ok).toBe(false);
  });

  it('rejects non-boolean required', () => {
    const data = buildTestSpec();
    (data['columns'] as Array<Record<string, unknown>>)[0] = {
      name: '項目',
      type: 'text',
      required: 'yes',
    };
    const result = parseAndValidate<TestSpec>(toFrontmatter(data), testSpecSchema);
    expect(result.ok).toBe(false);
  });

  it('rejects a visual style with an invalid hex color', () => {
    const data = buildTestSpec();
    (data['columns'] as Array<Record<string, unknown>>)[2] = {
      name: '結果',
      type: 'enum',
      values: ['OK'],
      visual: { OK: { background: 'pink' } },
    };
    const result = parseAndValidate<TestSpec>(toFrontmatter(data), testSpecSchema);
    expect(result.ok).toBe(false);
  });

  it('rejects unknown top-level keys', () => {
    const data = { ...buildTestSpec(), 不明: 'x' };
    const result = parseAndValidate<TestSpec>(toFrontmatter(data), testSpecSchema);
    expect(result.ok).toBe(false);
  });

  it('rejects column entries missing the name field', () => {
    const data = buildTestSpec();
    (data['columns'] as Array<Record<string, unknown>>)[0] = { type: 'text' };
    const result = parseAndValidate<TestSpec>(toFrontmatter(data), testSpecSchema);
    expect(result.ok).toBe(false);
  });
});
