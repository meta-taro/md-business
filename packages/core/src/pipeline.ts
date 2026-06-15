import { parseMarkdown } from './parse.js';
import { validateWith } from './validate.js';
import type { ParseAndValidateResult } from './types.js';

export function parseAndValidate<T>(
  src: string,
  schema: object,
): ParseAndValidateResult<T> {
  const parsed = parseMarkdown(src);
  const result = validateWith<T>(parsed.data, schema);
  if (!result.ok) {
    return { ok: false, errors: result.errors };
  }
  return {
    ok: true,
    frontmatter: result.data,
    body: parsed.body,
    ast: parsed.ast,
  };
}
