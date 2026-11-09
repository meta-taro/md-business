import { describe, expect, it } from 'vitest';
import { MAX_NAME_BYTES } from './documentName';
import { decodeEnvelope, encodeEnvelope, MAX_ENVELOPE_BYTES, PRESENCE_KIND } from './envelope';
import { MAX_PLACE_BYTES } from './place';

const md = { kind: 'markdown', branch: 'main', line: 4 } as const;
const tsv = { kind: 'tsv', branch: 'main', rowId: 'r1', column: '結果' } as const;
const A = 'github.com/o/r#docs/a.md';

describe('presence envelope', () => {
  it('names the kind in the app namespace the carrier accepts (lowercase letters and digits per segment)', () => {
    expect(PRESENCE_KIND).toBe('app.mdbusiness.presence');
    for (const segment of PRESENCE_KIND.split('.')) expect(segment).toMatch(/^[a-z0-9]+$/);
  });

  it('round-trips a place and a close', () => {
    for (const place of [md, tsv, null]) {
      const wire = encodeEnvelope(A, place);
      expect(wire).not.toBeNull();
      expect(decodeEnvelope(wire as string)).toEqual({ document: A, place });
    }
  });

  it('fits the longest allowed name with an ordinary place within the carrier limit', () => {
    const name = 'h/o/r#' + 'a'.repeat(MAX_NAME_BYTES - 6);
    const wire = encodeEnvelope(name, tsv);
    expect(wire).not.toBeNull();
    expect(new TextEncoder().encode(wire as string).length).toBeLessThanOrEqual(MAX_ENVELOPE_BYTES);
  });

  it('refuses a name and place that each fit but together exceed the carrier limit', () => {
    const name = 'h/o/r#' + 'a'.repeat(MAX_NAME_BYTES - 6);
    const column = 'c'.repeat(MAX_PLACE_BYTES - JSON.stringify({ branch: 'main', rowId: 'r', column: '' }).length);
    expect(encodeEnvelope(A, { kind: 'tsv', branch: 'main', rowId: 'r', column })).not.toBeNull();
    expect(encodeEnvelope(name, { kind: 'tsv', branch: 'main', rowId: 'r', column })).toBeNull();
  });

  it('refuses a name or place over its own limit instead of cutting it', () => {
    expect(encodeEnvelope('a'.repeat(MAX_NAME_BYTES + 1), md)).toBeNull();
    expect(encodeEnvelope('', md)).toBeNull();
    expect(encodeEnvelope(A, { ...tsv, column: 'c'.repeat(MAX_PLACE_BYTES) })).toBeNull();
  });

  it('drops anything from a peer that is not shaped like an envelope', () => {
    for (const text of [
      '',
      'not json',
      '[]',
      'null',
      JSON.stringify({ document: 1, place: '' }),
      JSON.stringify({ document: A }),
      JSON.stringify({ document: A, place: { branch: 'main' } }),
      JSON.stringify({ document: A, place: '' }),
      JSON.stringify({ document: '', place: '' }),
      'x'.repeat(MAX_ENVELOPE_BYTES + 1),
    ]) {
      expect(decodeEnvelope(text)).toBeNull();
    }
  });
});
