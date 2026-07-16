import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const compiledPath = path.resolve(__dirname, '../dist/validate.compiled.js');
const compiledSrc = readFileSync(compiledPath, 'utf-8');

function buildMinimalApiSpec(): Record<string, unknown> {
  return {
    schema: 'api-spec/v1',
    documentNumber: 'API-2026-001',
    title: '受発注 API 詳細設計',
    version: '0.1.0',
    issueDate: '2026-07-15',
    status: 'draft',
    protocol: 'rest',
    auth: 'none',
    authors: [{ name: '田中' }],
    endpoints: [
      { operationId: 'listUsers', method: 'GET', path: '/users', responses: [{ status: 200 }] },
    ],
  };
}

describe('validate.compiled.js standalone bundle', () => {
  it('has no ESM import statements for ajv runtime', () => {
    expect(compiledSrc).not.toMatch(/import\s+[^;]*\s+from\s+["']ajv\/dist\/runtime\//);
  });

  it('has no ESM import statements for ajv-formats', () => {
    expect(compiledSrc).not.toMatch(/import\s+[^;]*\s+from\s+["']ajv-formats/);
  });

  it('has no CommonJS require() calls for ajv runtime', () => {
    expect(compiledSrc).not.toMatch(/require\(\s*["']ajv\/dist\/runtime\//);
  });

  it('has no CommonJS require() calls for ajv-formats', () => {
    expect(compiledSrc).not.toMatch(/require\(\s*["']ajv-formats/);
  });

  it('does not reference __cjs_N namespace bindings (replaced by inlined helpers)', () => {
    expect(compiledSrc).not.toMatch(/__cjs_\d+/);
  });
});

describe('validate.compiled.js runtime behaviour after standalone inlining', () => {
  it('accepts a valid api-spec frontmatter object', async () => {
    const mod = await import('../dist/validate.compiled.js');
    const validate: any = (mod as any).default ?? (mod as any).validate;
    expect(validate(buildMinimalApiSpec())).toBe(true);
  });

  it('rejects an invalid date (format: date)', async () => {
    const mod = await import('../dist/validate.compiled.js');
    const validate: any = (mod as any).default ?? (mod as any).validate;
    expect(validate({ ...buildMinimalApiSpec(), issueDate: '2026-13-40' })).toBe(false);
  });

  it('rejects an empty string (minLength: 1 via ucs2length)', async () => {
    const mod = await import('../dist/validate.compiled.js');
    const validate: any = (mod as any).default ?? (mod as any).validate;
    expect(validate({ ...buildMinimalApiSpec(), documentNumber: '' })).toBe(false);
  });

  it('rejects an out-of-range response status (maximum: 599)', async () => {
    const mod = await import('../dist/validate.compiled.js');
    const validate: any = (mod as any).default ?? (mod as any).validate;
    const bad = buildMinimalApiSpec();
    (bad.endpoints as Array<{ responses: Array<{ status: number }> }>)[0]!.responses[0]!.status =
      999;
    expect(validate(bad)).toBe(false);
  });
});
