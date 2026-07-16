import {
  splitFrontmatter,
  validateWithCompiled,
  type CompiledValidator,
  type ValidationError,
} from '@md-business/core';
import { normalizeApiSpecFrontmatter, type NormalizeWarning } from './normalize.js';
import { autofillApiSpec, type AutofillWarning } from './autofill.js';
import type { ApiSpec } from './types.js';

export interface ApiSpecParseSuccess {
  ok: true;
  apiSpec: ApiSpec;
  body: string;
  warnings: Array<NormalizeWarning | AutofillWarning>;
}

export interface ApiSpecParseFailure {
  ok: false;
  errors: ValidationError[];
  warnings: Array<NormalizeWarning | AutofillWarning>;
}

export type ApiSpecParseResult = ApiSpecParseSuccess | ApiSpecParseFailure;

/**
 * End-to-end Markdown → ApiSpec pipeline:
 *
 *   1. splitFrontmatter — extract YAML block
 *   2. normalizeApiSpecFrontmatter — translate Japanese keys (エンドポイント →
 *      endpoints, リクエスト → request, レスポンス → responses etc.) and enum
 *      values (ステータス/プロトコル/認証/メソッド/型); dbRef stays verbatim
 *   3. autofillApiSpec — apply defaults (schema, version, status, protocol,
 *      auth); flag design inconsistencies (duplicate operationId / route /
 *      response status, dangling errorRef)
 *   4. validateWithCompiled — Ajv-compiled schema check
 *
 * `validate` is injected so this module stays Ajv-runtime-free for MV3 CSP.
 */
export function parseApiSpecMarkdown(
  src: string,
  validate: CompiledValidator,
): ApiSpecParseResult {
  const split = splitFrontmatter(src);
  const normalized = normalizeApiSpecFrontmatter(split.data);
  const autofilled = autofillApiSpec(normalized.data);
  const warnings = [...normalized.warnings, ...autofilled.warnings];
  const validation = validateWithCompiled<ApiSpec>(autofilled.data, validate);
  if (!validation.ok) {
    return { ok: false, errors: validation.errors, warnings };
  }
  return { ok: true, apiSpec: validation.data, body: split.body, warnings };
}

/**
 * Variant for callers that already parsed the frontmatter object.
 */
export function parseApiSpecObject(
  raw: unknown,
  validate: CompiledValidator,
):
  | { ok: true; apiSpec: ApiSpec; warnings: Array<NormalizeWarning | AutofillWarning> }
  | ApiSpecParseFailure {
  const normalized = normalizeApiSpecFrontmatter(raw);
  const autofilled = autofillApiSpec(normalized.data);
  const warnings = [...normalized.warnings, ...autofilled.warnings];
  const validation = validateWithCompiled<ApiSpec>(autofilled.data, validate);
  if (!validation.ok) {
    return { ok: false, errors: validation.errors, warnings };
  }
  return { ok: true, apiSpec: validation.data, warnings };
}
