import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import type { ValidationError, ValidationResult } from './types.js';

const defaultAjv = new Ajv2020({ allErrors: true, useDefaults: true });
addFormats(defaultAjv);

export function validateWith<T>(
  data: unknown,
  schema: object,
  ajv: Ajv2020 = defaultAjv,
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
