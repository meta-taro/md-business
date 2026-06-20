import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import validate from '../dist/validate.compiled.js';
import { parseSpecMarkdown, parseSpecObject } from '../src/parseSpec.js';

const here = dirname(fileURLToPath(import.meta.url));
const templatesDir = resolve(here, '../../../templates/spec');

function loadTemplate(name: string): string {
  return readFileSync(resolve(templatesDir, name), 'utf8');
}

describe('parseSpecMarkdown — Japanese frontmatter end-to-end', () => {
  it('parses templates/spec/standard-ja.md', () => {
    const result = parseSpecMarkdown(loadTemplate('standard-ja.md'), validate);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.spec.schemaVersion).toBe('spec/v1');
    expect(result.spec.documentNumber).toBeTruthy();
    expect(result.spec.title).toBeTruthy();
    expect(result.spec.status).toBe('draft');
    expect(result.spec.toc).toBe('auto');
    expect(result.spec.theme).toBe('blue');
    expect(result.spec.authors.length).toBeGreaterThan(0);
    expect(result.body).toContain('#'); // Markdown body present
  });

  it('returns ok=false with errors when required fields are missing', () => {
    const src = `---\nタイトル: 仕様書\n---\n# 本文\n`;
    const result = parseSpecMarkdown(src, validate);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.message.includes('documentNumber'))).toBe(true);
  });
});

describe('parseSpecObject — frontmatter object path', () => {
  it('validates a minimal Japanese-keyed object after autofill', () => {
    const result = parseSpecObject(
      {
        文書番号: 'SPEC-T-001',
        タイトル: 'テスト仕様書',
        発行日: '2026-06-17',
        作成者: [{ 名前: '田中' }],
      },
      validate,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // autofill defaults
    expect(result.spec.schemaVersion).toBe('spec/v1');
    expect(result.spec.version).toBe('0.1.0');
    expect(result.spec.status).toBe('draft');
    expect(result.spec.toc).toBe('auto');
  });

  it('surfaces a normalize collision warning alongside validated data', () => {
    const result = parseSpecObject(
      {
        文書番号: 'SPEC-T-002',
        タイトル: '同義語タイトル',
        表題: 'こちらが採用される',
        発行日: '2026-06-17',
        作成者: [{ 名前: '田中' }],
      },
      validate,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings.some((w) => w.path === 'title')).toBe(true);
  });

  it('surfaces an autofill warning for toc=manual without chapters', () => {
    const result = parseSpecObject(
      {
        文書番号: 'SPEC-T-003',
        タイトル: '章なし手動目次',
        発行日: '2026-06-17',
        作成者: [{ 名前: '田中' }],
        目次: '手動',
      },
      validate,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings.some((w) => w.path === 'chapters')).toBe(true);
  });

  it('fails with ValidationError when an unknown status survives normalization', () => {
    const result = parseSpecObject(
      {
        文書番号: 'SPEC-T-004',
        タイトル: '不明ステータス',
        発行日: '2026-06-17',
        ステータス: '保留',
        作成者: [{ 名前: '田中' }],
      },
      validate,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.path.includes('status'))).toBe(true);
  });

  it('fails with ValidationError when the input is not an object', () => {
    const result = parseSpecObject(42, validate);
    expect(result.ok).toBe(false);
  });
});
