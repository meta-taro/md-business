import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import validate from '../dist/validate.compiled.js';
import { parseApiSpecMarkdown } from '../src/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const templatesDir = path.resolve(here, '../../../templates/api-spec');

function loadTemplate(name: string): string {
  return readFileSync(path.resolve(templatesDir, name), 'utf8');
}

describe('templates/api-spec/standard-ja.md', () => {
  it('parses and validates end-to-end with no warnings', () => {
    const result = parseApiSpecMarkdown(loadTemplate('standard-ja.md'), validate);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings).toEqual([]);
  });

  it('normalizes the Japanese frontmatter to the canonical shape', () => {
    const result = parseApiSpecMarkdown(loadTemplate('standard-ja.md'), validate);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const spec = result.apiSpec;
    expect(spec.schema).toBe('api-spec/v1');
    expect(spec.protocol).toBe('rest');
    expect(spec.auth).toBe('bearer');
    expect(spec.status).toBe('review');
    expect(spec.endpoints.map((e) => e.operationId)).toEqual([
      'listOrders',
      'createOrder',
      'getOrder',
    ]);
    expect(spec.endpoints[0]?.method).toBe('GET');
  });

  it('keeps dbRef cross-references to the db-spec verbatim', () => {
    const result = parseApiSpecMarkdown(loadTemplate('standard-ja.md'), validate);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const createBody = result.apiSpec.endpoints[1]?.responses[0]?.body;
    expect(createBody?.fields[0]?.dbRef).toBe('API-2026-0001#orders.order_id');
  });

  it('resolves every errorRef against the declared error catalog', () => {
    const result = parseApiSpecMarkdown(loadTemplate('standard-ja.md'), validate);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const declared = new Set((result.apiSpec.errors ?? []).map((e) => e.code));
    const refs = result.apiSpec.endpoints
      .flatMap((e) => e.responses)
      .map((r) => r.errorRef)
      .filter((c): c is string => typeof c === 'string');
    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs) {
      expect(declared.has(ref)).toBe(true);
    }
  });
});
