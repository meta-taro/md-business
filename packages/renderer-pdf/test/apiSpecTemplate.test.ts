import { describe, it, expect } from 'vitest';
import type { ApiSpecField } from '@md-business/schema-api-spec';
import { renderApiSpecBody } from '../src/apiSpecTemplate.js';
import { standardApiSpec, minimalApiSpec } from './apiSpecFixtures.js';

/**
 * Build a chain of nested `object` fields `depthMarker0 → depthMarker1 → …` via
 * `of[]`, one field per level. `depthMarkerN` renders at table depth N, so the
 * chain lets a test assert exactly where the {@link MAX_FIELD_DEPTH} recursion
 * cutoff bites.
 */
function deepFieldChain(levels: number): ApiSpecField[] {
  let field: ApiSpecField = { name: `depthMarker${levels}`, type: 'string' };
  for (let d = levels - 1; d >= 0; d--) {
    field = { name: `depthMarker${d}`, type: 'object', of: [field] };
  }
  return [field];
}

describe('renderApiSpecBody — cover', () => {
  it('renders the article shell with the schema version', () => {
    const html = renderApiSpecBody(standardApiSpec());
    expect(html).toContain('class="mdb-api-spec"');
    expect(html).toContain('data-schema-version="api-spec/v1"');
  });

  it('renders the title and document number', () => {
    const html = renderApiSpecBody(standardApiSpec());
    expect(html).toContain('受発注システム API 設計書');
    expect(html).toContain('API-2026-0001');
  });

  it('renders the status badge with a Japanese label', () => {
    const html = renderApiSpecBody(standardApiSpec({ status: 'deprecated' }));
    expect(html).toContain('mdb-api-spec__status--deprecated');
    expect(html).toContain('非推奨');
  });

  it('maps the protocol enum to a display label', () => {
    expect(renderApiSpecBody(standardApiSpec({ protocol: 'rest' }))).toContain('REST');
    expect(renderApiSpecBody(standardApiSpec({ protocol: 'graphql' }))).toContain('GraphQL');
  });

  it('maps the auth enum to a Japanese label', () => {
    expect(renderApiSpecBody(standardApiSpec({ auth: 'bearer' }))).toContain('Bearer トークン');
    expect(renderApiSpecBody(standardApiSpec({ auth: 'apiKey' }))).toContain('API キー');
  });

  it('renders the baseUrl when present', () => {
    expect(renderApiSpecBody(standardApiSpec())).toContain('https://api.example.com/v1');
  });

  it('omits the baseUrl row when absent', () => {
    // minimalApiSpec carries no baseUrl (exactOptionalPropertyTypes forbids
    // passing `{ baseUrl: undefined }` as an override).
    const html = renderApiSpecBody(minimalApiSpec());
    expect(html).not.toContain('ベース URL');
  });

  it('renders authors, reviewers, and related docs', () => {
    const html = renderApiSpecBody(standardApiSpec());
    expect(html).toContain('田中 雅友');
    expect(html).toContain('佐藤 太郎');
    expect(html).toContain('/docs/architecture.md');
  });

  it('honours hideCover', () => {
    const html = renderApiSpecBody(standardApiSpec(), { hideCover: true });
    expect(html).not.toContain('mdb-api-spec__cover');
    // body still present
    expect(html).toContain('mdb-api-spec__endpoint');
  });

  it('applies a preset theme color as an inline accent variable', () => {
    const html = renderApiSpecBody(standardApiSpec({ theme: 'blue' }));
    expect(html).toContain('--mdb-color-accent:#2a4d7a');
  });

  it('accepts an explicit hex theme and ignores an invalid one', () => {
    expect(renderApiSpecBody(standardApiSpec({ theme: '#123abc' }))).toContain(
      '--mdb-color-accent:#123abc',
    );
    const bad = renderApiSpecBody(standardApiSpec({ theme: 'javascript:alert(1)' }));
    expect(bad).not.toContain('javascript:');
  });
});

describe('renderApiSpecBody — endpoints', () => {
  it('renders each endpoint method and path', () => {
    const html = renderApiSpecBody(standardApiSpec());
    expect(html).toContain('GET');
    expect(html).toContain('POST');
    expect(html).toContain('/orders');
    expect(html).toContain('/orders/{orderId}');
  });

  it('applies a per-method modifier class', () => {
    const html = renderApiSpecBody(standardApiSpec());
    expect(html).toContain('mdb-api-spec__method--get');
    expect(html).toContain('mdb-api-spec__method--post');
  });

  it('renders operationId, summary, and tags', () => {
    const html = renderApiSpecBody(standardApiSpec());
    expect(html).toContain('listOrders');
    expect(html).toContain('注文一覧を取得する');
    expect(html).toContain('orders, read');
  });

  it('renders the per-endpoint auth override label', () => {
    const html = renderApiSpecBody(standardApiSpec());
    // createOrder overrides to oauth2
    expect(html).toContain('OAuth 2.0');
  });

  it('marks a deprecated endpoint with a badge', () => {
    const html = renderApiSpecBody(standardApiSpec());
    expect(html).toContain('mdb-api-spec__deprecated-badge');
  });

  it('renders request query params, headers, and path params', () => {
    const html = renderApiSpecBody(standardApiSpec());
    expect(html).toContain('page');
    expect(html).toContain('X-Request-Id');
    expect(html).toContain('orderId');
  });

  it('renders a request body with its content type', () => {
    const html = renderApiSpecBody(standardApiSpec());
    expect(html).toContain('application/json');
    expect(html).toContain('sku');
    expect(html).toContain('qty');
  });

  it('renders response status codes and descriptions', () => {
    const html = renderApiSpecBody(standardApiSpec());
    expect(html).toContain('200');
    expect(html).toContain('201');
    expect(html).toContain('注文の配列');
  });

  it('renders errorRef references on responses', () => {
    const html = renderApiSpecBody(standardApiSpec());
    expect(html).toContain('UNAUTHORIZED');
    expect(html).toContain('VALIDATION_FAILED');
  });

  it('renders a dbRef on a field', () => {
    const html = renderApiSpecBody(standardApiSpec());
    expect(html).toContain('orders.id');
    expect(html).toContain('products.sku');
  });
});

describe('renderApiSpecBody — nested fields (of[])', () => {
  it('renders array element type as array<...>', () => {
    const html = renderApiSpecBody(standardApiSpec());
    // items: array<string> element type from `of[0].type`
    expect(html).toContain('array&lt;string&gt;');
  });

  it('renders fields nested inside an array element (items[].id)', () => {
    const html = renderApiSpecBody(standardApiSpec());
    // items[].id and items[].total nested via of[]
    expect(html).toContain('>id<');
    expect(html).toContain('>total<');
  });

  it('truncates recursion at MAX_FIELD_DEPTH (12) on a pathological deep shape', () => {
    // A malicious/degenerate document could nest `of[]` fields arbitrarily deep.
    // The renderer walks depths 0..12 (13 levels) and refuses to go further,
    // so the tree is silently truncated rather than blowing the stack.
    const spec = standardApiSpec({
      endpoints: [
        {
          operationId: 'deep',
          method: 'GET',
          path: '/deep',
          responses: [
            {
              status: 200,
              body: { contentType: 'application/json', fields: deepFieldChain(15) },
            },
          ],
        },
      ],
    });
    const html = renderApiSpecBody(spec);
    // Within the bound: rendered.
    expect(html).toContain('depthMarker0');
    expect(html).toContain('depthMarker12');
    // Past MAX_FIELD_DEPTH: dropped (depthMarker13 would render at depth 13).
    expect(html).not.toContain('depthMarker13');
    expect(html).not.toContain('depthMarker14');
  });
});

describe('renderApiSpecBody — defensive edges', () => {
  it('labels an array field with no declared element type as array<unknown>', () => {
    const spec = standardApiSpec({
      endpoints: [
        {
          operationId: 'e',
          method: 'GET',
          path: '/e',
          responses: [
            {
              status: 200,
              body: {
                contentType: 'application/json',
                fields: [{ name: 'loose', type: 'array' }],
              },
            },
          ],
        },
      ],
    });
    expect(renderApiSpecBody(spec)).toContain('array&lt;unknown&gt;');
  });

  it('omits the request block when request has no populated groups', () => {
    const spec = standardApiSpec({
      endpoints: [
        {
          operationId: 'e',
          method: 'GET',
          path: '/e',
          request: {},
          responses: [{ status: 200 }],
        },
      ],
    });
    expect(renderApiSpecBody(spec)).not.toContain('mdb-api-spec__request');
  });

  it('renders a response body block with an empty fields list (content type only)', () => {
    const spec = standardApiSpec({
      endpoints: [
        {
          operationId: 'e',
          method: 'GET',
          path: '/e',
          responses: [
            { status: 204, body: { contentType: 'application/json', fields: [] } },
          ],
        },
      ],
    });
    const html = renderApiSpecBody(spec);
    expect(html).toContain('application/json');
    expect(html).toContain('204');
  });

  it('omits the responses block when an endpoint declares no responses', () => {
    const spec = standardApiSpec({
      endpoints: [{ operationId: 'e', method: 'GET', path: '/e', responses: [] }],
    });
    expect(renderApiSpecBody(spec)).not.toContain('mdb-api-spec__responses');
  });
});

describe('renderApiSpecBody — errors catalog', () => {
  it('renders the error catalog with code, http status, and message', () => {
    const html = renderApiSpecBody(standardApiSpec());
    expect(html).toContain('エラーカタログ');
    expect(html).toContain('認証に失敗しました');
    expect(html).toContain('入力値が不正です');
  });

  it('omits the error catalog when there are no errors', () => {
    const html = renderApiSpecBody(standardApiSpec({ errors: [] }));
    expect(html).not.toContain('エラーカタログ');
  });
});

describe('renderApiSpecBody — minimal / conventions', () => {
  it('renders a minimal RPC doc without optional sections', () => {
    const html = renderApiSpecBody(minimalApiSpec());
    expect(html).toContain('/rpc/ping');
    expect(html).toContain('RPC');
    expect(html).not.toContain('エラーカタログ');
    expect(html).not.toContain('関連文書');
  });

  it('does not emit filler tokens for empty cells (data-cell-conventions)', () => {
    const html = renderApiSpecBody(minimalApiSpec());
    expect(html).not.toContain('N/A');
    expect(html).not.toContain('TBD');
    expect(html).not.toContain('—');
  });
});

describe('renderApiSpecBody — HTML safety', () => {
  it('escapes malicious operationId, path, and descriptions', () => {
    const html = renderApiSpecBody(
      standardApiSpec({
        title: '<script>alert(1)</script>',
        endpoints: [
          {
            operationId: '"><img src=x onerror=alert(1)>',
            method: 'GET',
            path: '/evil/"><svg onload=alert(1)>',
            summary: '<b>x</b>',
            responses: [
              {
                status: 200,
                body: {
                  contentType: 'application/json',
                  fields: [{ name: '"><svg onload=alert(1)>', type: 'string' }],
                },
              },
            ],
          },
        ],
      }),
    );
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(html).not.toContain('<svg onload=alert(1)>');
    expect(html).toContain('&lt;script&gt;');
  });
});
