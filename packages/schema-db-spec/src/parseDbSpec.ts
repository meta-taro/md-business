import {
  splitFrontmatter,
  validateWithCompiled,
  type CompiledValidator,
  type ValidationError,
} from '@md-business/core';
import { normalizeDbSpecFrontmatter, type NormalizeWarning } from './normalize.js';
import { autofillDbSpec, type AutofillWarning } from './autofill.js';
import type { DbSpec } from './types.js';

export interface DbSpecParseSuccess {
  ok: true;
  dbSpec: DbSpec;
  body: string;
  warnings: Array<NormalizeWarning | AutofillWarning>;
}

export interface DbSpecParseFailure {
  ok: false;
  errors: ValidationError[];
  warnings: Array<NormalizeWarning | AutofillWarning>;
}

export type DbSpecParseResult = DbSpecParseSuccess | DbSpecParseFailure;

/**
 * End-to-end Markdown → DbSpec pipeline:
 *
 *   1. splitFrontmatter — extract YAML block
 *   2. normalizeDbSpecFrontmatter — translate Japanese keys (テーブル → tables,
 *      列 → columns, 主キー → pk etc.); column type values stay verbatim (B-2)
 *   3. autofillDbSpec — apply defaults (schema, version, status); flag
 *      design inconsistencies (duplicate names, pk+nullable, dangling
 *      index/fk references)
 *   4. validateWithCompiled — Ajv-compiled schema check
 *
 * `validate` is injected so this module stays Ajv-runtime-free for MV3 CSP.
 */
export function parseDbSpecMarkdown(
  src: string,
  validate: CompiledValidator,
): DbSpecParseResult {
  const split = splitFrontmatter(src);
  const normalized = normalizeDbSpecFrontmatter(split.data);
  const autofilled = autofillDbSpec(normalized.data);
  const warnings = [...normalized.warnings, ...autofilled.warnings];
  const validation = validateWithCompiled<DbSpec>(autofilled.data, validate);
  if (!validation.ok) {
    return { ok: false, errors: validation.errors, warnings };
  }
  return { ok: true, dbSpec: validation.data, body: split.body, warnings };
}

/**
 * Variant for callers that already parsed the frontmatter object.
 */
export function parseDbSpecObject(
  raw: unknown,
  validate: CompiledValidator,
):
  | { ok: true; dbSpec: DbSpec; warnings: Array<NormalizeWarning | AutofillWarning> }
  | DbSpecParseFailure {
  const normalized = normalizeDbSpecFrontmatter(raw);
  const autofilled = autofillDbSpec(normalized.data);
  const warnings = [...normalized.warnings, ...autofilled.warnings];
  const validation = validateWithCompiled<DbSpec>(autofilled.data, validate);
  if (!validation.ok) {
    return { ok: false, errors: validation.errors, warnings };
  }
  return { ok: true, dbSpec: validation.data, warnings };
}
