import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { parseAndValidate } from '@md-business/core/runtime';
import { normalizeTestSpecFrontmatter } from '@md-business/schema-test-spec';
// Standalone compiled validator (Apps Script bundle). Using the same artifact
// the runtime ships ensures the example would actually load inside the add-on.
import validateTestSpec from '@md-business/schema-test-spec/validate';

const here = dirname(fileURLToPath(import.meta.url));
const examplesDir = resolve(here, '../examples');

function loadExample(name: string): string {
  return readFileSync(resolve(examplesDir, name), 'utf8');
}

describe('examples/test-spec-sample.md', () => {
  it('parses, normalizes and passes schema validation (OSS sample must work as-shipped)', () => {
    const raw = loadExample('test-spec-sample.md');
    const result = parseAndValidate<Record<string, unknown>>(raw, { type: 'object' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { data, warnings } = normalizeTestSpecFrontmatter(result.frontmatter);
    expect(warnings).toEqual([]);
    const valid = (validateTestSpec as unknown as (d: unknown) => boolean)(data);
    if (!valid) {
      const errors = (validateTestSpec as unknown as { errors?: unknown }).errors;
      console.error('examples/test-spec-sample.md validation errors:', errors);
    }
    expect(valid).toBe(true);
  });
});
