import { describe, expect, it } from 'vitest';
import { decodePlace, encodePlace } from './place';

describe('encodePlace / decodePlace', () => {
  it('round-trips a Markdown line', () => {
    const place = { kind: 'markdown', branch: 'main', line: 12 } as const;
    expect(decodePlace(encodePlace(place) ?? '')).toEqual(place);
  });

  it('round-trips a TSV cell addressed by row ID', () => {
    const place = { kind: 'tsv', branch: 'main', rowId: 'r-7', column: '期待結果' } as const;
    expect(decodePlace(encodePlace(place) ?? '')).toEqual(place);
  });

  it('marks a TSV cell without row IDs as one that may shift', () => {
    const place = { kind: 'tsv', branch: 'main', row: 3, column: '手順' } as const;
    expect(JSON.parse(encodePlace(place) ?? '{}')).toEqual({ branch: 'main', row: 3, column: '手順', shifts: true });
    expect(decodePlace(encodePlace(place) ?? '')).toEqual(place);
  });

  it('refuses to encode a place over 512 bytes rather than cutting it', () => {
    expect(encodePlace({ kind: 'tsv', branch: 'main', rowId: 'r', column: 'あ'.repeat(200) })).toBeNull();
  });

  it('reads an empty place as a closed document', () => {
    expect(decodePlace('')).toBeNull();
  });

  it('ignores what a peer sends when it is not a place we understand', () => {
    expect(decodePlace('not json')).toBeNull();
    expect(decodePlace('[]')).toBeNull();
    expect(decodePlace('{"branch":"main"}')).toBeNull();
    expect(decodePlace('{"branch":"main","line":-1}')).toBeNull();
    expect(decodePlace('{"branch":"main","line":1.5}')).toBeNull();
    expect(decodePlace('{"branch":1,"line":1}')).toBeNull();
    expect(decodePlace('{"branch":"main","rowId":"r"}')).toBeNull();
    expect(decodePlace(`{"branch":"main","line":1,"pad":"${'x'.repeat(600)}"}`)).toBeNull();
  });
});
