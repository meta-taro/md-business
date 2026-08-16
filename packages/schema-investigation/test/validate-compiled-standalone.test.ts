import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const compiledPath = path.resolve(__dirname, '../dist/validate.compiled.js');
const compiledSrc = readFileSync(compiledPath, 'utf-8');

function buildMinimalInvestigation(): Record<string, unknown> {
  return {
    schema: 'investigation/v1',
    kind: 'log',
    documentNumber: 'INV-2026-0001',
    title: '深夜帯のログイン失敗急増の調査',
    createdAt: '2026-08-12T09:30:00+09:00',
    status: 'investigating',
    authors: [{ name: '山田' }],
    targets: [
      {
        path: 'logs/app.jsonl',
        sha256: '3b1f0c6a9d4e2f8b7c5a1d0e6f4b2a9c8d7e5f3a1b0c9d8e7f6a5b4c3d2e1f00',
      },
    ],
    tools: [{ name: 'md-business mcp-server', version: '0.9.0' }],
    window: { from: '2026-08-11T00:00:00+09:00', to: '2026-08-12T00:00:00+09:00' },
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

  // The bundle inlines the text of `ajv-formats/dist/formats.js`, and that
  // file's last line points at a source map. We never emit the map, so every
  // tool that reads this artifact reports a missing file. The noise is loud
  // enough to bury the errors worth reading.
  it('does not point at a source map it never emits', () => {
    expect(compiledSrc).not.toMatch(/sourceMappingURL/);
  });
});

describe('validate.compiled.js runtime behaviour after standalone inlining', () => {
  it('accepts a valid investigation frontmatter object', async () => {
    const mod = await import('../dist/validate.compiled.js');
    const validate: any = (mod as any).default ?? (mod as any).validate;
    expect(validate(buildMinimalInvestigation())).toBe(true);
  });

  it('rejects an invalid date-time (format: date-time)', async () => {
    const mod = await import('../dist/validate.compiled.js');
    const validate: any = (mod as any).default ?? (mod as any).validate;
    expect(validate({ ...buildMinimalInvestigation(), createdAt: '2026-13-40T99:99:99' })).toBe(
      false,
    );
  });

  it('rejects an empty string (minLength: 1 via ucs2length)', async () => {
    const mod = await import('../dist/validate.compiled.js');
    const validate: any = (mod as any).default ?? (mod as any).validate;
    expect(validate({ ...buildMinimalInvestigation(), documentNumber: '' })).toBe(false);
  });

  it('rejects a target hash that is not a 64-digit lowercase SHA-256 (pattern)', async () => {
    const mod = await import('../dist/validate.compiled.js');
    const validate: any = (mod as any).default ?? (mod as any).validate;
    const bad = buildMinimalInvestigation();
    (bad.targets as Array<{ sha256: string }>)[0]!.sha256 = 'DEADBEEF';
    expect(validate(bad)).toBe(false);
  });

  it('rejects a finding whose evidence is prose instead of an Evidence reference', async () => {
    const mod = await import('../dist/validate.compiled.js');
    const validate: any = (mod as any).default ?? (mod as any).validate;
    const bad = {
      ...buildMinimalInvestigation(),
      findings: [{ id: 'F-01', summary: '認証失敗が集中している', evidence: ['ログを見た感じ'] }],
    };
    expect(validate(bad)).toBe(false);
  });
});
