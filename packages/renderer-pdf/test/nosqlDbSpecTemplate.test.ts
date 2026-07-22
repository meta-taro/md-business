import { describe, it, expect } from 'vitest';
import type { NosqlShape } from '@md-business/schema-nosql-db-spec';
import { renderNosqlDbSpecBody } from '../src/nosqlDbSpecTemplate.js';
import { standardNosqlDbSpec, minimalNosqlDbSpec } from './nosqlDbSpecFixtures.js';

/**
 * Build a chain of nested `map` fields `depthMarker0 → depthMarker1 → …`, one
 * field per level. `depthMarkerN` renders at table depth N, so the chain lets a
 * test assert exactly where the {@link MAX_FIELD_DEPTH} recursion cutoff bites.
 */
function deepMapChain(levels: number): NosqlShape {
  let shape: NosqlShape = { [`depthMarker${levels}`]: { type: 'string' } };
  for (let d = levels - 1; d >= 0; d--) {
    shape = { [`depthMarker${d}`]: { type: 'map', shape } };
  }
  return shape;
}

describe('renderNosqlDbSpecBody — cover', () => {
  it('renders the article shell with the schema version', () => {
    const html = renderNosqlDbSpecBody(standardNosqlDbSpec());
    expect(html).toContain('class="mdb-nosql-db-spec"');
    expect(html).toContain('data-schema-version="nosql-db-spec/v1"');
  });

  it('renders the title and document number', () => {
    const html = renderNosqlDbSpecBody(standardNosqlDbSpec());
    expect(html).toContain('受発注システム NoSQL 設計書');
    expect(html).toContain('NDB-2026-0001');
  });

  it('renders the status badge with a Japanese label', () => {
    const html = renderNosqlDbSpecBody(standardNosqlDbSpec({ status: 'deprecated' }));
    expect(html).toContain('mdb-nosql-db-spec__status--deprecated');
    expect(html).toContain('非推奨');
  });

  it('maps the engine enum to a brand label', () => {
    expect(renderNosqlDbSpecBody(standardNosqlDbSpec({ engine: 'firestore' }))).toContain(
      'Cloud Firestore',
    );
    expect(renderNosqlDbSpecBody(standardNosqlDbSpec({ engine: 'dynamodb' }))).toContain(
      'Amazon DynamoDB',
    );
  });

  it('renders the multiRegion label verbatim when present', () => {
    expect(renderNosqlDbSpecBody(standardNosqlDbSpec())).toContain('nam5');
  });

  it('omits the region row when multiRegion is absent', () => {
    // minimalNosqlDbSpec carries no multiRegion (mirrors db-spec's minimal fixture pattern —
    // exactOptionalPropertyTypes forbids passing `{ multiRegion: undefined }` as an override).
    const html = renderNosqlDbSpecBody(minimalNosqlDbSpec());
    expect(html).not.toContain('リージョン');
  });

  it('renders authors, reviewers, and related docs', () => {
    const html = renderNosqlDbSpecBody(standardNosqlDbSpec());
    expect(html).toContain('伊藤 太郎');
    expect(html).toContain('佐藤 太郎');
    expect(html).toContain('/docs/architecture.md');
  });

  it('honours hideCover', () => {
    const html = renderNosqlDbSpecBody(standardNosqlDbSpec(), { hideCover: true });
    expect(html).not.toContain('mdb-nosql-db-spec__cover');
    // body still present
    expect(html).toContain('mdb-nosql-db-spec__collection');
  });

  it('applies a preset theme color as an inline accent variable', () => {
    const html = renderNosqlDbSpecBody(standardNosqlDbSpec({ theme: 'blue' }));
    expect(html).toContain('--mdb-color-accent:#2a4d7a');
  });

  it('accepts an explicit hex theme and ignores an invalid one', () => {
    expect(renderNosqlDbSpecBody(standardNosqlDbSpec({ theme: '#123abc' }))).toContain(
      '--mdb-color-accent:#123abc',
    );
    const bad = renderNosqlDbSpecBody(standardNosqlDbSpec({ theme: 'javascript:alert(1)' }));
    expect(bad).not.toContain('javascript:');
  });
});

describe('renderNosqlDbSpecBody — collections', () => {
  it('renders each collection path as a heading', () => {
    const html = renderNosqlDbSpecBody(standardNosqlDbSpec());
    expect(html).toContain('users');
    expect(html).toContain('users/{userId}/orders');
  });

  it('renders the document ID strategy label', () => {
    const html = renderNosqlDbSpecBody(standardNosqlDbSpec());
    expect(html).toContain('認証 UID');
    expect(html).toContain('複合キー');
  });

  it('renders composite partition/sort key fields', () => {
    const html = renderNosqlDbSpecBody(standardNosqlDbSpec());
    expect(html).toContain('userId');
    expect(html).toContain('createdAt');
  });

  it('renders TTL field with a disabled marker', () => {
    const html = renderNosqlDbSpecBody(standardNosqlDbSpec());
    expect(html).toContain('expireAt');
    expect(html).toContain('（無効）');
  });

  it('renders index target fields, scope, and mode', () => {
    const html = renderNosqlDbSpecBody(standardNosqlDbSpec());
    expect(html).toContain('ASCENDING');
    expect(html).toContain('DESCENDING');
  });
});

describe('renderNosqlDbSpecBody — recursive shape', () => {
  it('renders top-level fields with type and required mark', () => {
    const html = renderNosqlDbSpecBody(standardNosqlDbSpec());
    expect(html).toContain('displayName');
    expect(html).toContain('email');
  });

  it('renders nested map fields (profile.address.city)', () => {
    const html = renderNosqlDbSpecBody(standardNosqlDbSpec());
    expect(html).toContain('profile');
    expect(html).toContain('bio');
    expect(html).toContain('city');
    expect(html).toContain('zip');
  });

  it('renders array element type as array<...>', () => {
    const html = renderNosqlDbSpecBody(standardNosqlDbSpec());
    // tags: array<string>
    expect(html).toContain('array&lt;string&gt;');
    // items: array<map>
    expect(html).toContain('array&lt;map&gt;');
  });

  it('renders fields nested inside an array<map> element (items[].sku)', () => {
    const html = renderNosqlDbSpecBody(standardNosqlDbSpec());
    expect(html).toContain('sku');
    expect(html).toContain('qty');
  });

  it('renders enum values as a hint', () => {
    const html = renderNosqlDbSpecBody(standardNosqlDbSpec());
    expect(html).toContain('admin');
    expect(html).toContain('member');
  });

  it('renders default values verbatim', () => {
    const html = renderNosqlDbSpecBody(standardNosqlDbSpec());
    // role default 'member' and total default 0
    expect(html).toContain('member');
    expect(html).toContain('>0<');
  });

  it('truncates recursion at MAX_FIELD_DEPTH (12) on a pathological deep shape', () => {
    // A malicious/degenerate document could nest `map` fields arbitrarily deep.
    // The renderer walks depths 0..12 (13 levels) and refuses to go further,
    // so the tree is silently truncated rather than blowing the stack.
    const spec = standardNosqlDbSpec({
      collections: [
        { path: 'deep', docIdStrategy: 'uuid', shape: deepMapChain(15) },
      ],
    });
    const html = renderNosqlDbSpecBody(spec);
    // Within the bound: rendered.
    expect(html).toContain('depthMarker0');
    expect(html).toContain('depthMarker12');
    // Past MAX_FIELD_DEPTH: dropped (depthMarker13 would render at depth 13).
    expect(html).not.toContain('depthMarker13');
    expect(html).not.toContain('depthMarker14');
  });
});

describe('renderNosqlDbSpecBody — security rules', () => {
  it('renders match, allow verbs, and condition', () => {
    const html = renderNosqlDbSpecBody(standardNosqlDbSpec());
    expect(html).toContain('/users/{uid}');
    expect(html).toContain('read');
    expect(html).toContain('request.auth != null');
  });

  it('omits the security section when there are no rules', () => {
    const html = renderNosqlDbSpecBody(standardNosqlDbSpec({ securityRules: [] }));
    expect(html).not.toContain('セキュリティルール');
  });
});

describe('renderNosqlDbSpecBody — minimal / conventions', () => {
  it('renders a minimal DynamoDB doc without optional sections', () => {
    const html = renderNosqlDbSpecBody(minimalNosqlDbSpec());
    expect(html).toContain('sessions');
    expect(html).toContain('Amazon DynamoDB');
    expect(html).not.toContain('セキュリティルール');
    expect(html).not.toContain('関連文書');
  });

  it('does not emit filler tokens for empty cells (data-cell-conventions)', () => {
    const html = renderNosqlDbSpecBody(minimalNosqlDbSpec());
    expect(html).not.toContain('N/A');
    expect(html).not.toContain('TBD');
    expect(html).not.toContain('—');
  });
});

describe('renderNosqlDbSpecBody — HTML safety', () => {
  it('escapes malicious field names, paths, and descriptions', () => {
    const html = renderNosqlDbSpecBody(
      standardNosqlDbSpec({
        title: '<script>alert(1)</script>',
        collections: [
          {
            path: 'evil/"><img src=x onerror=alert(1)>',
            docIdStrategy: 'uuid',
            shape: {
              '"><svg onload=alert(1)>': { type: 'string', description: '<b>x</b>' },
            },
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
