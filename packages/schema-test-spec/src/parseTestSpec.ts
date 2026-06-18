import {
  splitFrontmatter,
  validateWithCompiled,
  type CompiledValidator,
  type ValidationError,
} from '@md-business/core';
import { normalizeTestSpecFrontmatter, type NormalizeWarning } from './normalize.js';
import { autofillTestSpec, type AutofillWarning } from './autofill.js';
import type { TestSpec } from './types.js';

export interface TestSpecParseSuccess {
  ok: true;
  testSpec: TestSpec;
  body: string;
  warnings: Array<NormalizeWarning | AutofillWarning>;
}

export interface TestSpecParseFailure {
  ok: false;
  errors: ValidationError[];
  warnings: Array<NormalizeWarning | AutofillWarning>;
}

export type TestSpecParseResult = TestSpecParseSuccess | TestSpecParseFailure;

/**
 * End-to-end Markdown → TestSpec pipeline:
 *
 *   1. splitFrontmatter — extract YAML block
 *   2. normalizeTestSpecFrontmatter — translate Japanese keys (列 → columns,
 *      型 → type, 値 → values etc.)
 *   3. autofillTestSpec — apply defaults (schema, version, status); flag
 *      column-level inconsistencies (duplicate names, enum without values,
 *      visual keys not in values)
 *   4. validateWithCompiled — Ajv-compiled schema check
 *
 * `validate` is injected so this module stays Ajv-runtime-free for MV3 CSP.
 */
export function parseTestSpecMarkdown(
  src: string,
  validate: CompiledValidator,
): TestSpecParseResult {
  const split = splitFrontmatter(src);
  const normalized = normalizeTestSpecFrontmatter(split.data);
  const autofilled = autofillTestSpec(normalized.data);
  const warnings = [...normalized.warnings, ...autofilled.warnings];
  const validation = validateWithCompiled<TestSpec>(autofilled.data, validate);
  if (!validation.ok) {
    return { ok: false, errors: validation.errors, warnings };
  }
  return { ok: true, testSpec: validation.data, body: split.body, warnings };
}

/**
 * Variant for callers that already parsed the frontmatter object.
 */
export function parseTestSpecObject(
  raw: unknown,
  validate: CompiledValidator,
):
  | { ok: true; testSpec: TestSpec; warnings: Array<NormalizeWarning | AutofillWarning> }
  | TestSpecParseFailure {
  const normalized = normalizeTestSpecFrontmatter(raw);
  const autofilled = autofillTestSpec(normalized.data);
  const warnings = [...normalized.warnings, ...autofilled.warnings];
  const validation = validateWithCompiled<TestSpec>(autofilled.data, validate);
  if (!validation.ok) {
    return { ok: false, errors: validation.errors, warnings };
  }
  return { ok: true, testSpec: validation.data, warnings };
}
