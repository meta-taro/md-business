import { describe, it, expect } from 'vitest';
import { buildDocument, splitFrontmatter, type CompiledValidator } from '../src/index.js';

/** A standalone-style validator that always accepts. */
const alwaysValid: CompiledValidator = () => true;

/** A standalone-style validator that always rejects with one Ajv-shaped error. */
function rejecting(
  errors: NonNullable<CompiledValidator['errors']>,
): CompiledValidator {
  return Object.assign(() => false, { errors });
}

describe('buildDocument', () => {
  it('serializes frontmatter + body and reports validation ok for valid data', () => {
    const result = buildDocument({
      frontmatter: { schemaVersion: 'invoice/v1', invoiceNumber: 'INV-1' },
      body: '# Invoice\n',
      validate: alwaysValid,
    });

    expect(result.validation).toEqual({
      ok: true,
      data: { schemaVersion: 'invoice/v1', invoiceNumber: 'INV-1' },
    });
    expect(result.markdown).toBe(
      '---\nschemaVersion: invoice/v1\ninvoiceNumber: INV-1\n---\n# Invoice\n',
    );
  });

  it('round-trips through splitFrontmatter', () => {
    const frontmatter = { スキーマ: 'api-spec/v1', 文書番号: 'API-1', 版: '0.1.0' };
    const body = '## エンドポイント\n\n本文。\n';

    const result = buildDocument({ frontmatter, body, validate: alwaysValid });
    const split = splitFrontmatter(result.markdown);

    expect(split.data).toEqual(frontmatter);
    expect(split.body).toBe(body);
  });

  it('still returns the built markdown even when validation fails (so callers can preview a diff)', () => {
    const result = buildDocument({
      frontmatter: { schemaVersion: 'invoice/v1' },
      body: 'body',
      validate: rejecting([
        { instancePath: '/invoiceNumber', message: "must have required property 'invoiceNumber'", keyword: 'required' },
      ]),
    });

    expect(result.markdown).toBe('---\nschemaVersion: invoice/v1\n---\nbody');
    expect(result.validation.ok).toBe(false);
  });

  it('maps validator errors into core ValidationError shape', () => {
    const result = buildDocument({
      frontmatter: { schemaVersion: 'invoice/v1' },
      body: '',
      validate: rejecting([
        { instancePath: '/dueDate', message: 'must match format "date"', keyword: 'format' },
      ]),
    });

    expect(result.validation).toEqual({
      ok: false,
      errors: [{ path: '/dueDate', message: 'must match format "date"', keyword: 'format' }],
    });
  });

  it('accepts an empty body', () => {
    const result = buildDocument({
      frontmatter: { schemaVersion: 'invoice/v1', invoiceNumber: 'INV-2' },
      body: '',
      validate: alwaysValid,
    });

    expect(result.markdown).toBe('---\nschemaVersion: invoice/v1\ninvoiceNumber: INV-2\n---\n');
    expect(result.validation.ok).toBe(true);
  });

  it('emits an unfronted document verbatim when frontmatter is empty', () => {
    const result = buildDocument({
      frontmatter: {},
      body: 'plain body without frontmatter\n',
      validate: alwaysValid,
    });

    expect(result.markdown).toBe('plain body without frontmatter\n');
  });
});
