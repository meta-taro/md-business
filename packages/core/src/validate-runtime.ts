import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { validateWithCompiled, type CompiledValidator } from './validate.js';
import type { ValidationResult } from './types.js';

// Runtime-Ajv path: server / node only. Pulling this module into a browser
// bundle drags in `new Function()` (Ajv's code-generation runtime), which
// MV3 CSP rejects. Use `validateWithCompiled` from `./validate.js` instead.

const defaultAjv = new Ajv2020({ allErrors: true, useDefaults: true });
addFormats(defaultAjv);

export function validateWith<T>(
  data: unknown,
  schema: object,
  ajv: Ajv2020 = defaultAjv,
): ValidationResult<T> {
  const validate = ajv.compile(schema) as CompiledValidator;
  return validateWithCompiled<T>(data, validate);
}
