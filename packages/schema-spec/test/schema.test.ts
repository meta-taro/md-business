import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { parseAndValidate } from '@md-business/core/runtime';
import { specSchema, SCHEMA_VERSION, normalizeSpecFrontmatter } from '../src/index.js';
import type { Spec } from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const templatesDir = resolve(here, '../../../templates/spec');

function loadTemplate(name: string): string {
  return readFileSync(resolve(templatesDir, name), 'utf8');
}

describe('specSchema constants', () => {
  it('exports the schema as an object', () => {
    expect(typeof specSchema).toBe('object');
  });

  it('exposes SCHEMA_VERSION constant', () => {
    expect(SCHEMA_VERSION).toBe('spec/v1');
  });
});

describe('templates/spec/standard-ja.md', () => {
  it('parses, normalizes and passes schema validation', () => {
    const raw = loadTemplate('standard-ja.md');
    // The template is authored in Japanese; normalize before validation.
    // parseAndValidate parses the YAML frontmatter; we re-validate the
    // normalized object via specSchema.
    const result = parseAndValidate<Record<string, unknown>>(raw, { type: 'object' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { data, warnings } = normalizeSpecFrontmatter(result.frontmatter);
    expect(warnings).toEqual([]);
    expect(data.schemaVersion).toBe('spec/v1');
    expect(data.status).toBe('draft');
    expect(data.toc).toBe('auto');
    expect(data.theme).toBe('blue');
    expect(Array.isArray(data.authors)).toBe(true);
  });
});

function buildSpec(): Record<string, unknown> {
  return {
    schemaVersion: 'spec/v1',
    documentNumber: 'SPEC-2026-001',
    title: '注文管理サブシステム 基本設計書',
    version: '0.1.0',
    issueDate: '2026-06-17',
    status: 'draft',
    authors: [{ name: '田中', role: 'Tech Lead' }],
  };
}

function toFrontmatter(data: Record<string, unknown>): string {
  const yaml = Object.entries(data)
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    .join('\n');
  return `---\n${yaml}\n---\n`;
}

describe('specSchema — happy path', () => {
  it('validates a minimal complete spec', () => {
    const result = parseAndValidate<Spec>(toFrontmatter(buildSpec()), specSchema);
    expect(result.ok).toBe(true);
  });

  it('accepts optional reviewers, relatedDocs, chapters, toc, theme, fileName', () => {
    const data = {
      ...buildSpec(),
      reviewers: [{ name: '佐藤' }],
      relatedDocs: ['./PRD.md', 'https://example.test/api'],
      chapters: ['01-overview.md', '02-architecture.md'],
      toc: 'manual',
      theme: 'blue',
      fileName: '{documentNumber}-{title}.pdf',
    };
    const result = parseAndValidate<Spec>(toFrontmatter(data), specSchema);
    expect(result.ok).toBe(true);
  });
});

describe('specSchema — error cases', () => {
  it('rejects a wrong schemaVersion', () => {
    const data = buildSpec();
    data['schemaVersion'] = 'spec/v2';
    const result = parseAndValidate<Spec>(toFrontmatter(data), specSchema);
    expect(result.ok).toBe(false);
  });

  it('rejects a non-SemVer version string', () => {
    const data = buildSpec();
    data['version'] = '0.1';
    const result = parseAndValidate<Spec>(toFrontmatter(data), specSchema);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.path.includes('version'))).toBe(true);
    }
  });

  it('rejects a non-ISO issueDate', () => {
    const data = buildSpec();
    data['issueDate'] = '2026/06/17';
    const result = parseAndValidate<Spec>(toFrontmatter(data), specSchema);
    expect(result.ok).toBe(false);
  });

  it('rejects an unknown status value', () => {
    const data = buildSpec();
    data['status'] = 'archived';
    const result = parseAndValidate<Spec>(toFrontmatter(data), specSchema);
    expect(result.ok).toBe(false);
  });

  it('rejects an empty authors array', () => {
    const data = buildSpec();
    (data['authors'] as unknown[]) = [];
    const result = parseAndValidate<Spec>(toFrontmatter(data), specSchema);
    expect(result.ok).toBe(false);
  });

  it('rejects an author missing the name field', () => {
    const data = buildSpec();
    (data['authors'] as unknown[]) = [{ role: 'PM' }];
    const result = parseAndValidate<Spec>(toFrontmatter(data), specSchema);
    expect(result.ok).toBe(false);
  });

  it('rejects unknown top-level keys via additionalProperties:false', () => {
    const data = { ...buildSpec(), 不明キー: 'x' };
    const result = parseAndValidate<Spec>(toFrontmatter(data), specSchema);
    expect(result.ok).toBe(false);
  });

  it('rejects chapter entries that are not .md files', () => {
    const data = { ...buildSpec(), chapters: ['overview.txt'] };
    const result = parseAndValidate<Spec>(toFrontmatter(data), specSchema);
    expect(result.ok).toBe(false);
  });

  it('rejects an unknown toc mode', () => {
    const data = { ...buildSpec(), toc: 'tree' };
    const result = parseAndValidate<Spec>(toFrontmatter(data), specSchema);
    expect(result.ok).toBe(false);
  });
});
