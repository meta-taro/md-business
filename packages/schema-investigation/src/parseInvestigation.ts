import {
  splitFrontmatter,
  validateWithCompiled,
  depthValidationError,
  type CompiledValidator,
  type ValidationError,
} from '@md-business/core';
import { normalizeInvestigationFrontmatter, type NormalizeWarning } from './normalize.js';
import { autofillInvestigation, type AutofillWarning } from './autofill.js';
import type { Investigation } from './types.js';

export type InvestigationWarning = NormalizeWarning | AutofillWarning;

export interface InvestigationParseSuccess {
  ok: true;
  investigation: Investigation;
  body: string;
  warnings: InvestigationWarning[];
}

export interface InvestigationParseFailure {
  ok: false;
  errors: ValidationError[];
  warnings: InvestigationWarning[];
}

export type InvestigationParseResult = InvestigationParseSuccess | InvestigationParseFailure;

/**
 * End-to-end Markdown → Investigation pipeline:
 *
 *   1. splitFrontmatter — extract YAML block
 *   2. normalizeInvestigationFrontmatter — translate Japanese keys to English
 *   3. autofillInvestigation — apply defaults (schema, status)
 *   4. validateWithCompiled — Ajv-compiled schema check
 *
 * Steps 1–3 are pure data transforms; only step 4 gates.
 *
 * `validate` is injected so this module stays Ajv-runtime-free for MV3 CSP.
 */
export function parseInvestigationMarkdown(
  src: string,
  validate: CompiledValidator,
): InvestigationParseResult {
  const split = splitFrontmatter(src);
  const tooDeep = depthValidationError(split.data);
  if (tooDeep) {
    return { ok: false, errors: [tooDeep], warnings: [] };
  }
  const normalized = normalizeInvestigationFrontmatter(split.data);
  const autofilled = autofillInvestigation(normalized.data);
  const warnings = [...normalized.warnings, ...autofilled.warnings];
  const validation = validateWithCompiled<Investigation>(autofilled.data, validate);
  if (!validation.ok) {
    return { ok: false, errors: validation.errors, warnings };
  }
  return { ok: true, investigation: validation.data, body: split.body, warnings };
}

/**
 * Variant for callers that already parsed the frontmatter object.
 */
export function parseInvestigationObject(
  raw: unknown,
  validate: CompiledValidator,
):
  | { ok: true; investigation: Investigation; warnings: InvestigationWarning[] }
  | InvestigationParseFailure {
  const tooDeep = depthValidationError(raw);
  if (tooDeep) {
    return { ok: false, errors: [tooDeep], warnings: [] };
  }
  const normalized = normalizeInvestigationFrontmatter(raw);
  const autofilled = autofillInvestigation(normalized.data);
  const warnings = [...normalized.warnings, ...autofilled.warnings];
  const validation = validateWithCompiled<Investigation>(autofilled.data, validate);
  if (!validation.ok) {
    return { ok: false, errors: validation.errors, warnings };
  }
  return { ok: true, investigation: validation.data, warnings };
}
