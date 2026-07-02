import { describe, it, expect } from 'vitest';
import { autofillDbSpec } from '../src/index.js';

describe('autofillDbSpec — input guards', () => {
  it('returns empty data for non-objects', () => {
    expect(autofillDbSpec(null).data).toEqual({});
    expect(autofillDbSpec(undefined).data).toEqual({});
    expect(autofillDbSpec('x').data).toEqual({});
    expect(autofillDbSpec([1, 2]).data).toEqual({});
  });
});

describe('autofillDbSpec — malformed structure tolerance', () => {
  it('skips non-object entries in tables / columns / indexes without warnings', () => {
    const { warnings } = autofillDbSpec({
      tables: [
        'not a table',
        {
          name: 't',
          columns: ['not a column', { name: 'id', type: 'integer' }],
          indexes: ['not an index', { name: 'idx', columns: 'not an array' }],
        },
      ],
    });
    expect(warnings).toEqual([]);
  });
});

describe('autofillDbSpec — defaults', () => {
  it('fills schema / version / status on a bare object', () => {
    const { data, warnings } = autofillDbSpec({});
    expect(data).toMatchObject({
      schema: 'db-spec/v1',
      version: '0.1.0',
      status: 'draft',
    });
    expect(warnings).toEqual([]);
  });

  it('does not overwrite explicit values', () => {
    const { data } = autofillDbSpec({
      schema: 'db-spec/v1',
      version: '1.2.3',
      status: 'approved',
    });
    expect(data).toMatchObject({
      version: '1.2.3',
      status: 'approved',
    });
  });

  it('treats empty strings as missing for version/status', () => {
    const { data } = autofillDbSpec({ version: '', status: '' });
    expect(data.version).toBe('0.1.0');
    expect(data.status).toBe('draft');
  });

  it('does not mutate the input object', () => {
    const input: Record<string, unknown> = { title: 't' };
    const { data } = autofillDbSpec(input);
    expect(input).toEqual({ title: 't' });
    expect(data).not.toBe(input);
  });
});

describe('autofillDbSpec — table-level warnings', () => {
  it('warns on duplicate table names', () => {
    const { warnings } = autofillDbSpec({
      tables: [
        { name: 'users', columns: [{ name: 'id', type: 'bigserial' }] },
        { name: 'users', columns: [{ name: 'id', type: 'bigserial' }] },
      ],
    });
    expect(warnings.some((w) => w.path === 'tables[1].name')).toBe(true);
  });

  it('warns on duplicate column names within a table', () => {
    const { warnings } = autofillDbSpec({
      tables: [
        {
          name: 'users',
          columns: [
            { name: 'id', type: 'bigserial' },
            { name: 'id', type: 'bigint' },
          ],
        },
      ],
    });
    expect(warnings.some((w) => w.path === 'tables[0].columns[1].name')).toBe(true);
  });

  it('does not warn on same column name across different tables', () => {
    const { warnings } = autofillDbSpec({
      tables: [
        { name: 'users', columns: [{ name: 'id', type: 'bigserial' }] },
        { name: 'orders', columns: [{ name: 'id', type: 'bigserial' }] },
      ],
    });
    expect(warnings).toEqual([]);
  });

  it('warns when a pk column also declares nullable: true', () => {
    const { warnings } = autofillDbSpec({
      tables: [
        {
          name: 'users',
          columns: [{ name: 'id', type: 'bigserial', pk: true, nullable: true }],
        },
      ],
    });
    expect(warnings.some((w) => w.path === 'tables[0].columns[0].nullable')).toBe(true);
  });

  it('warns when an index references an undeclared column', () => {
    const { warnings } = autofillDbSpec({
      tables: [
        {
          name: 'users',
          columns: [{ name: 'id', type: 'bigserial' }],
          indexes: [{ name: 'ix_users_email', columns: ['email'] }],
        },
      ],
    });
    expect(warnings.some((w) => w.path === 'tables[0].indexes[0].columns')).toBe(true);
  });

  it('does not warn when index columns are all declared', () => {
    const { warnings } = autofillDbSpec({
      tables: [
        {
          name: 'users',
          columns: [
            { name: 'id', type: 'bigserial' },
            { name: 'email', type: 'varchar(255)' },
          ],
          indexes: [{ name: 'ix_users_email', columns: ['email'] }],
        },
      ],
    });
    expect(warnings).toEqual([]);
  });

  it('warns when an fk references a table not declared in the document', () => {
    const { warnings } = autofillDbSpec({
      tables: [
        {
          name: 'orders',
          columns: [
            {
              name: 'user_id',
              type: 'bigint',
              fk: { table: 'users', column: 'id' },
            },
          ],
        },
      ],
    });
    expect(warnings.some((w) => w.path === 'tables[0].columns[0].fk.table')).toBe(true);
  });

  it('does not warn when the fk target table is declared', () => {
    const { warnings } = autofillDbSpec({
      tables: [
        { name: 'users', columns: [{ name: 'id', type: 'bigserial' }] },
        {
          name: 'orders',
          columns: [
            { name: 'user_id', type: 'bigint', fk: { table: 'users', column: 'id' } },
          ],
        },
      ],
    });
    expect(warnings).toEqual([]);
  });
});
