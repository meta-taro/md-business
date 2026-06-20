import {
  splitFrontmatter,
  validateWithCompiled,
  type CompiledValidator,
  type ValidationError,
} from '@md-business/core';
import { normalizeSpecFrontmatter, type NormalizeWarning } from './normalize.js';
import { autofillSpec, type AutofillWarning } from './autofill.js';
import type { Spec } from './types.js';

export interface SpecParseSuccess {
  ok: true;
  spec: Spec;
  body: string;
  warnings: Array<NormalizeWarning | AutofillWarning>;
}

export interface SpecParseFailure {
  ok: false;
  errors: ValidationError[];
  warnings: Array<NormalizeWarning | AutofillWarning>;
}

export type SpecParseResult = SpecParseSuccess | SpecParseFailure;

/**
 * End-to-end Markdown → Spec pipeline:
 *
 *   1. splitFrontmatter — extract YAML block
 *   2. normalizeSpecFrontmatter — translate Japanese keys to English
 *   3. autofillSpec — apply defaults (schemaVersion, version, status, toc)
 *   4. validateWithCompiled — Ajv-compiled schema check
 *
 * Steps 1–3 are pure data transforms; only step 4 gates. Authors get a
 * single function that lets them write minimal Japanese frontmatter (e.g.
 * just `文書番号 / タイトル / 発行日 / 作成者`) and have it render.
 *
 * `validate` is injected so this module stays Ajv-runtime-free for MV3 CSP.
 */
export function parseSpecMarkdown(
  src: string,
  validate: CompiledValidator,
): SpecParseResult {
  const split = splitFrontmatter(src);
  const normalized = normalizeSpecFrontmatter(split.data);
  const autofilled = autofillSpec(normalized.data);
  const warnings = [...normalized.warnings, ...autofilled.warnings];
  const validation = validateWithCompiled<Spec>(autofilled.data, validate);
  if (!validation.ok) {
    return { ok: false, errors: validation.errors, warnings };
  }
  return { ok: true, spec: validation.data, body: split.body, warnings };
}

/**
 * Variant for callers that already parsed the frontmatter object.
 */
export function parseSpecObject(
  raw: unknown,
  validate: CompiledValidator,
):
  | { ok: true; spec: Spec; warnings: Array<NormalizeWarning | AutofillWarning> }
  | SpecParseFailure {
  const normalized = normalizeSpecFrontmatter(raw);
  const autofilled = autofillSpec(normalized.data);
  const warnings = [...normalized.warnings, ...autofilled.warnings];
  const validation = validateWithCompiled<Spec>(autofilled.data, validate);
  if (!validation.ok) {
    return { ok: false, errors: validation.errors, warnings };
  }
  return { ok: true, spec: validation.data, warnings };
}
