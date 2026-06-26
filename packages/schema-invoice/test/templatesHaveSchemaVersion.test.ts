import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const templatesDir = resolve(here, '../../../templates/invoice');

function extractFrontmatter(raw: string): string {
  const lines = raw.split(/\r?\n/);
  if (lines[0]?.trim() !== '---') {
    throw new Error('frontmatter delimiter "---" not found at file start');
  }
  const endIdx = lines.findIndex((line, idx) => idx > 0 && line.trim() === '---');
  if (endIdx < 0) {
    throw new Error('frontmatter closing delimiter "---" not found');
  }
  return lines.slice(1, endIdx).join('\n');
}

function hasSchemaVersionLine(frontmatter: string): boolean {
  const SCHEMA_VERSION_LINE =
    /^(?:schemaVersion|スキーマ)\s*:\s*["']?invoice\/v1["']?\s*$/m;
  return SCHEMA_VERSION_LINE.test(frontmatter);
}

const INVOICE_TEMPLATES = readdirSync(templatesDir).filter((f) => f.endsWith('.md'));

describe('templates/invoice/*.md must explicitly declare schemaVersion', () => {
  it('discovers at least the four shipped invoice templates', () => {
    expect(INVOICE_TEMPLATES.length).toBeGreaterThanOrEqual(4);
    expect(INVOICE_TEMPLATES).toContain('standard.md');
    expect(INVOICE_TEMPLATES).toContain('standard-ja.md');
    expect(INVOICE_TEMPLATES).toContain('tax-exempt-ja.md');
    expect(INVOICE_TEMPLATES).toContain('inbound-eligible.md');
  });

  for (const filename of INVOICE_TEMPLATES) {
    it(`${filename} declares schemaVersion (or スキーマ) = invoice/v1 in frontmatter`, () => {
      const raw = readFileSync(resolve(templatesDir, filename), 'utf8');
      const frontmatter = extractFrontmatter(raw);
      expect(hasSchemaVersionLine(frontmatter)).toBe(true);
    });
  }
});
