import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import type { ValidationError, ValidationResult } from './types.js';

const defaultAjv = new Ajv({ allErrors: true, useDefaults: true });
addFormats(defaultAjv);

export function validateWith<T>(
  data: unknown,
  schema: object,
  ajv: Ajv = defaultAjv,
): ValidationResult<T> {
  const validate = ajv.compile(schema);
  if (validate(data)) {
    return { ok: true, data: data as T };
  }
  // Ajv guarantees `errors` is populated when validate() returns false.
  const errors: ValidationError[] = validate.errors!.map((e) => ({
    path: e.instancePath || '/',
    message: e.message ?? 'unknown error',
    keyword: e.keyword,
  }));
  return { ok: false, errors };
}
