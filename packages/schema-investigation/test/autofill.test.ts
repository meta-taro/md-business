import { describe, it, expect } from 'vitest';
import { autofillInvestigation } from '../src/index.js';

describe('autofillInvestigation', () => {
  it('fills the schema id and the initial status', () => {
    const { data, warnings } = autofillInvestigation({ title: 'ログイン失敗の急増' });
    expect(data['schema']).toBe('investigation/v1');
    expect(data['status']).toBe('investigating');
    expect(warnings).toEqual([]);
  });

  it('keeps values the author already wrote', () => {
    const { data } = autofillInvestigation({ schema: 'investigation/v1', status: 'concluded' });
    expect(data['status']).toBe('concluded');
  });

  it('does not invent a kind — which data source was read is not guessable', () => {
    const { data } = autofillInvestigation({ title: 'x' });
    expect(data['kind']).toBeUndefined();
  });

  it('does not mutate the input', () => {
    const input = { title: 'x' };
    autofillInvestigation(input);
    expect(input).toEqual({ title: 'x' });
  });

  it('returns an empty object for non-object input', () => {
    expect(autofillInvestigation(null).data).toEqual({});
  });

  it('warns when an investigation is concluded without a single finding', () => {
    const { warnings } = autofillInvestigation({ status: 'concluded', findings: [] });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.path).toBe('findings');
  });

  it('does not warn about an empty findings list while still investigating', () => {
    expect(autofillInvestigation({ status: 'investigating' }).warnings).toEqual([]);
  });

  it('warns when the investigated window runs backwards', () => {
    const { warnings } = autofillInvestigation({
      window: { from: '2026-08-12T00:00:00+09:00', to: '2026-08-11T00:00:00+09:00' },
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.path).toBe('window');
  });

  it('accepts a window whose bounds are equal', () => {
    const at = '2026-08-12T00:00:00+09:00';
    expect(autofillInvestigation({ window: { from: at, to: at } }).warnings).toEqual([]);
  });

  it('leaves an unparsable window alone — the schema reports it', () => {
    const { warnings } = autofillInvestigation({ window: { from: 'きのう', to: 'きょう' } });
    expect(warnings).toEqual([]);
  });
});
