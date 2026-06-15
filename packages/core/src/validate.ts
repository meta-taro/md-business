import type { ValidationError, ValidationResult } from './types.js';

// NOTE: This module is intentionally Ajv-free so it can be tree-shaken into
// browser bundles. `validateWith` (the runtime Ajv code-gen path) lives in
// `./validate-runtime.ts` and is imported lazily.
//
// Why split? MV3 CSP (`script-src 'self'`) rejects `new Function()`, which
// Ajv's runtime `compile()` uses. Browser code paths use
// `validateWithCompiled` against a standalone-compiled validator instead.

/**
 * Validator shape produced by Ajv's standalone codegen
 * (`ajv/dist/standalone`). The function returns `true` on valid data and
 * exposes any errors as a property afterwards.
 *
 * Use this overload from browser bundles to avoid shipping Ajv's runtime
 * code-generation path, which calls `new Function()` and is rejected by
 * Chrome MV3's `script-src 'self'` policy.
 */
export type CompiledValidator = ((data: unknown) => boolean) & {
  errors?: Array<{
    instancePath?: string;
    message?: string;
    keyword: string;
  }> | null;
};

export function validateWithCompiled<T>(
  data: unknown,
  validate: CompiledValidator,
): ValidationResult<T> {
  if (validate(data)) {
    return { ok: true, data: data as T };
  }
  const errors: ValidationError[] = (validate.errors ?? []).map((e) => ({
    path: e.instancePath || '/',
    message: e.message ?? 'unknown error',
    keyword: e.keyword,
  }));
  return { ok: false, errors };
}
