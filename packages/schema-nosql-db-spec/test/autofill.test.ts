import { describe, it, expect } from 'vitest';
import { autofillNosqlDbSpec } from '../src/index.js';

describe('autofillNosqlDbSpec — input guards', () => {
  it('returns empty data for non-objects', () => {
    expect(autofillNosqlDbSpec(null).data).toEqual({});
    expect(autofillNosqlDbSpec(undefined).data).toEqual({});
    expect(autofillNosqlDbSpec('x').data).toEqual({});
    expect(autofillNosqlDbSpec([1, 2]).data).toEqual({});
  });
});

describe('autofillNosqlDbSpec — defaults', () => {
  it('fills schema / version / status on a bare object', () => {
    const { data, warnings } = autofillNosqlDbSpec({});
    expect(data['schema']).toBe('nosql-db-spec/v1');
    expect(data['version']).toBe('0.1.0');
    expect(data['status']).toBe('draft');
    expect(warnings).toEqual([]);
  });

  it('treats empty strings as missing', () => {
    const { data } = autofillNosqlDbSpec({ version: '', status: '' });
    expect(data['version']).toBe('0.1.0');
    expect(data['status']).toBe('draft');
  });

  it('does not override provided values', () => {
    const { data } = autofillNosqlDbSpec({
      schema: 'nosql-db-spec/v1',
      version: '2.0.0',
      status: 'approved',
    });
    expect(data['version']).toBe('2.0.0');
    expect(data['status']).toBe('approved');
  });

  it('does not mutate the input object', () => {
    const input = { title: 'x' };
    autofillNosqlDbSpec(input);
    expect(input).toEqual({ title: 'x' });
  });
});

describe('autofillNosqlDbSpec — duplicate collection paths', () => {
  it('warns when two collections declare the same path', () => {
    const { warnings } = autofillNosqlDbSpec({
      collections: [
        { path: 'users', docIdStrategy: 'auto', shape: { a: { type: 'string' } } },
        { path: 'users', docIdStrategy: 'auto', shape: { b: { type: 'string' } } },
      ],
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.path).toBe('collections[1].path');
    expect(warnings[0]?.message).toContain('users');
    expect(warnings[0]?.message).toContain('重複');
  });
});

describe('autofillNosqlDbSpec — composite key consistency', () => {
  it('warns when partitionKeyField is set but docIdStrategy is not composite', () => {
    const { warnings } = autofillNosqlDbSpec({
      collections: [
        {
          path: 'orders',
          docIdStrategy: 'auto',
          partitionKeyField: 'tenantId',
          shape: { tenantId: { type: 'string' } },
        },
      ],
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.path).toBe('collections[0].partitionKeyField');
    expect(warnings[0]?.message).toContain('composite');
  });

  it('warns when sortKeyField is set but docIdStrategy is not composite', () => {
    const { warnings } = autofillNosqlDbSpec({
      collections: [
        {
          path: 'orders',
          docIdStrategy: 'uuid',
          sortKeyField: 'createdAt',
          shape: { createdAt: { type: 'timestamp' } },
        },
      ],
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.path).toBe('collections[0].sortKeyField');
  });

  it('warns when composite partitionKeyField is not declared in shape', () => {
    const { warnings } = autofillNosqlDbSpec({
      collections: [
        {
          path: 'orders',
          docIdStrategy: 'composite',
          partitionKeyField: 'tenantId',
          shape: { other: { type: 'string' } },
        },
      ],
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.path).toBe('collections[0].partitionKeyField');
    expect(warnings[0]?.message).toContain('tenantId');
    expect(warnings[0]?.message).toContain('shape');
  });

  it('accepts a clean composite declaration without warnings', () => {
    const { warnings } = autofillNosqlDbSpec({
      collections: [
        {
          path: 'orders',
          docIdStrategy: 'composite',
          partitionKeyField: 'tenantId',
          sortKeyField: 'createdAt',
          shape: {
            tenantId: { type: 'string' },
            createdAt: { type: 'timestamp' },
          },
        },
      ],
    });
    expect(warnings).toEqual([]);
  });
});

describe('autofillNosqlDbSpec — ttl / index field references', () => {
  it('warns when ttl.field is not declared in shape', () => {
    const { warnings } = autofillNosqlDbSpec({
      collections: [
        {
          path: 'sessions',
          docIdStrategy: 'auto',
          shape: { token: { type: 'string' } },
          ttl: { field: 'expiresAt' },
        },
      ],
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.path).toBe('collections[0].ttl.field');
    expect(warnings[0]?.message).toContain('expiresAt');
  });

  it('warns when index fields reference undeclared shape fields', () => {
    const { warnings } = autofillNosqlDbSpec({
      collections: [
        {
          path: 'orders',
          docIdStrategy: 'auto',
          shape: { createdAt: { type: 'timestamp' } },
          indexes: [{ fields: ['createdAt', 'missing1', 'missing2'] }],
        },
      ],
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.path).toBe('collections[0].indexes[0].fields');
    expect(warnings[0]?.message).toContain('missing1');
    expect(warnings[0]?.message).toContain('missing2');
  });

  it('resolves dot-notation index fields against the top-level segment', () => {
    const { warnings } = autofillNosqlDbSpec({
      collections: [
        {
          path: 'orders',
          docIdStrategy: 'auto',
          shape: { meta: { type: 'map', shape: { region: { type: 'string' } } } },
          indexes: [{ fields: ['meta.region'] }],
        },
      ],
    });
    expect(warnings).toEqual([]);
  });
});

describe('autofillNosqlDbSpec — malformed structure tolerance', () => {
  it('skips non-object entries without warnings', () => {
    const { warnings } = autofillNosqlDbSpec({
      collections: [
        'not a collection',
        {
          path: 'x',
          docIdStrategy: 'auto',
          shape: 'not a shape',
          indexes: ['not an index', { fields: 'not an array' }],
          ttl: 'not a ttl',
        },
      ],
    });
    expect(warnings).toEqual([]);
  });
});
