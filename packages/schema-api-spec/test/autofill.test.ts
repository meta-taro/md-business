import { describe, it, expect } from 'vitest';
import { autofillApiSpec } from '../src/index.js';

describe('autofillApiSpec — defaults', () => {
  it('returns empty data for a non-object input', () => {
    expect(autofillApiSpec(null)).toEqual({ data: {}, warnings: [] });
    expect(autofillApiSpec('x')).toEqual({ data: {}, warnings: [] });
    expect(autofillApiSpec([])).toEqual({ data: {}, warnings: [] });
  });

  it('fills schema / version / status / protocol / auth when missing', () => {
    const { data } = autofillApiSpec({ documentNumber: 'API-1', title: 't' });
    expect(data).toMatchObject({
      schema: 'api-spec/v1',
      version: '0.1.0',
      status: 'draft',
      protocol: 'rest',
      auth: 'none',
    });
  });

  it('does not overwrite values the author supplied', () => {
    const { data } = autofillApiSpec({
      schema: 'api-spec/v1',
      version: '2.3.4',
      status: 'approved',
      protocol: 'graphql',
      auth: 'oauth2',
    });
    expect(data).toMatchObject({
      version: '2.3.4',
      status: 'approved',
      protocol: 'graphql',
      auth: 'oauth2',
    });
  });

  it('treats empty-string version / status / protocol / auth as missing', () => {
    const { data } = autofillApiSpec({ version: '', status: '', protocol: '', auth: '' });
    expect(data).toMatchObject({
      version: '0.1.0',
      status: 'draft',
      protocol: 'rest',
      auth: 'none',
    });
  });

  it('does not mutate the input object', () => {
    const input = { documentNumber: 'API-1' };
    autofillApiSpec(input);
    expect(input).toEqual({ documentNumber: 'API-1' });
  });
});

describe('autofillApiSpec — design warnings', () => {
  it('warns on duplicate operationId', () => {
    const { warnings } = autofillApiSpec({
      endpoints: [
        { operationId: 'listUsers', method: 'GET', path: '/users', responses: [{ status: 200 }] },
        { operationId: 'listUsers', method: 'GET', path: '/admins', responses: [{ status: 200 }] },
      ],
    });
    expect(warnings.some((w) => w.path === 'endpoints[1].operationId')).toBe(true);
  });

  it('warns on duplicate method + path route', () => {
    const { warnings } = autofillApiSpec({
      endpoints: [
        { operationId: 'a', method: 'GET', path: '/users', responses: [{ status: 200 }] },
        { operationId: 'b', method: 'GET', path: '/users', responses: [{ status: 200 }] },
      ],
    });
    expect(warnings.some((w) => w.path === 'endpoints[1].path')).toBe(true);
  });

  it('does not warn when method matches but path differs', () => {
    const { warnings } = autofillApiSpec({
      endpoints: [
        { operationId: 'a', method: 'GET', path: '/users', responses: [{ status: 200 }] },
        { operationId: 'b', method: 'POST', path: '/users', responses: [{ status: 201 }] },
      ],
    });
    expect(warnings).toEqual([]);
  });

  it('warns on duplicate response status within one endpoint', () => {
    const { warnings } = autofillApiSpec({
      endpoints: [
        {
          operationId: 'a',
          method: 'GET',
          path: '/users',
          responses: [{ status: 200 }, { status: 200 }],
        },
      ],
    });
    expect(warnings.some((w) => w.path === 'endpoints[0].responses[1].status')).toBe(true);
  });

  it('warns when errorRef references an undeclared error code', () => {
    const { warnings } = autofillApiSpec({
      endpoints: [
        {
          operationId: 'a',
          method: 'GET',
          path: '/users',
          responses: [{ status: 404, errorRef: 'NOT_FOUND' }],
        },
      ],
      errors: [{ code: 'UNAUTHORIZED', httpStatus: 401, message: 'x' }],
    });
    expect(warnings.some((w) => w.path === 'endpoints[0].responses[0].errorRef')).toBe(true);
  });

  it('does not warn about errorRef when no errors catalog is declared', () => {
    const { warnings } = autofillApiSpec({
      endpoints: [
        {
          operationId: 'a',
          method: 'GET',
          path: '/users',
          responses: [{ status: 404, errorRef: 'NOT_FOUND' }],
        },
      ],
    });
    expect(warnings).toEqual([]);
  });

  it('does not warn when errorRef resolves to a declared error code', () => {
    const { warnings } = autofillApiSpec({
      endpoints: [
        {
          operationId: 'a',
          method: 'GET',
          path: '/users',
          responses: [{ status: 404, errorRef: 'NOT_FOUND' }],
        },
      ],
      errors: [{ code: 'NOT_FOUND', httpStatus: 404, message: 'x' }],
    });
    expect(warnings).toEqual([]);
  });

  it('ignores malformed endpoint / response entries without throwing', () => {
    const { warnings } = autofillApiSpec({
      endpoints: [null, 'x', { operationId: 42 }, { responses: ['y', null] }],
    });
    expect(warnings).toEqual([]);
  });
});
