import {
  splitFrontmatter,
  validateWithCompiled,
  type CompiledValidator,
  type ValidationError,
} from '@md-business/core';
import {
  normalizeNosqlDbSpecFrontmatter,
  type NormalizeWarning,
} from './normalize.js';
import { autofillNosqlDbSpec, type AutofillWarning } from './autofill.js';
import type { NosqlDbSpec } from './types.js';

export interface NosqlDbSpecParseSuccess {
  ok: true;
  nosqlDbSpec: NosqlDbSpec;
  body: string;
  warnings: Array<NormalizeWarning | AutofillWarning>;
}

export interface NosqlDbSpecParseFailure {
  ok: false;
  errors: ValidationError[];
  warnings: Array<NormalizeWarning | AutofillWarning>;
}

export type NosqlDbSpecParseResult =
  | NosqlDbSpecParseSuccess
  | NosqlDbSpecParseFailure;

/**
 * End-to-end Markdown → NosqlDbSpec pipeline:
 *
 *   1. splitFrontmatter — extract YAML block
 *   2. normalizeNosqlDbSpecFrontmatter — translate Japanese keys
 *      (コレクション → collections, 形状 → shape etc.); shape field NAMES
 *      stay verbatim, engineSpecific passes through untranslated
 *   3. autofillNosqlDbSpec — apply defaults (schema, version, status); flag
 *      design inconsistencies (duplicate paths, composite key / ttl / index
 *      references not declared in shape)
 *   4. validateWithCompiled — Ajv-compiled schema check
 *
 * `validate` is injected so this module stays Ajv-runtime-free for MV3 CSP.
 */
export function parseNosqlDbSpecMarkdown(
  src: string,
  validate: CompiledValidator,
): NosqlDbSpecParseResult {
  const split = splitFrontmatter(src);
  const normalized = normalizeNosqlDbSpecFrontmatter(split.data);
  const autofilled = autofillNosqlDbSpec(normalized.data);
  const warnings = [...normalized.warnings, ...autofilled.warnings];
  const validation = validateWithCompiled<NosqlDbSpec>(autofilled.data, validate);
  if (!validation.ok) {
    return { ok: false, errors: validation.errors, warnings };
  }
  return { ok: true, nosqlDbSpec: validation.data, body: split.body, warnings };
}

/**
 * Variant for callers that already parsed the frontmatter object.
 */
export function parseNosqlDbSpecObject(
  raw: unknown,
  validate: CompiledValidator,
):
  | {
      ok: true;
      nosqlDbSpec: NosqlDbSpec;
      warnings: Array<NormalizeWarning | AutofillWarning>;
    }
  | NosqlDbSpecParseFailure {
  const normalized = normalizeNosqlDbSpecFrontmatter(raw);
  const autofilled = autofillNosqlDbSpec(normalized.data);
  const warnings = [...normalized.warnings, ...autofilled.warnings];
  const validation = validateWithCompiled<NosqlDbSpec>(autofilled.data, validate);
  if (!validation.ok) {
    return { ok: false, errors: validation.errors, warnings };
  }
  return { ok: true, nosqlDbSpec: validation.data, warnings };
}
