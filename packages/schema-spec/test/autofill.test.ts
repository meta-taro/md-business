import { describe, it, expect } from 'vitest';
import { autofillSpec } from '../src/index.js';

describe('autofillSpec — input guards', () => {
  it('returns empty data for non-objects', () => {
    expect(autofillSpec(null).data).toEqual({});
    expect(autofillSpec(undefined).data).toEqual({});
    expect(autofillSpec('x').data).toEqual({});
    expect(autofillSpec([1, 2]).data).toEqual({});
  });
});

describe('autofillSpec — defaults', () => {
  it('fills schemaVersion / version / status / toc on a bare object', () => {
    const { data, warnings } = autofillSpec({});
    expect(data).toMatchObject({
      schemaVersion: 'spec/v1',
      version: '0.1.0',
      status: 'draft',
      toc: 'auto',
    });
    expect(warnings).toEqual([]);
  });

  it('does not overwrite explicit values', () => {
    const { data } = autofillSpec({
      schemaVersion: 'spec/v1',
      version: '1.2.3',
      status: 'approved',
      toc: 'manual',
      chapters: ['a.md'],
    });
    expect(data).toMatchObject({
      version: '1.2.3',
      status: 'approved',
      toc: 'manual',
    });
  });

  it('treats empty strings as missing for version/status/toc', () => {
    const { data } = autofillSpec({ version: '', status: '', toc: '' });
    expect(data.version).toBe('0.1.0');
    expect(data.status).toBe('draft');
    expect(data.toc).toBe('auto');
  });

  it('does not mutate the input object', () => {
    const input: Record<string, unknown> = { title: 't' };
    const { data } = autofillSpec(input);
    expect(input).toEqual({ title: 't' });
    expect(data).not.toBe(input);
  });
});

describe('autofillSpec — toc/chapters cross-check', () => {
  it('warns when toc=manual but chapters is empty', () => {
    const { warnings } = autofillSpec({ toc: 'manual' });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.path).toBe('chapters');
    expect(warnings[0]!.message).toContain('章ファイル');
  });

  it('warns when toc=manual but chapters is an empty array', () => {
    const { warnings } = autofillSpec({ toc: 'manual', chapters: [] });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.path).toBe('chapters');
  });

  it('warns when toc=auto AND chapters is non-empty (mixed signal)', () => {
    const { warnings } = autofillSpec({ toc: 'auto', chapters: ['01.md'] });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.path).toBe('toc');
    expect(warnings[0]!.message).toContain('章ファイル');
  });

  it('emits no warning when toc=manual and chapters has entries', () => {
    const { warnings } = autofillSpec({ toc: 'manual', chapters: ['01.md'] });
    expect(warnings).toEqual([]);
  });

  it('emits no warning when toc defaults to auto and chapters is omitted', () => {
    const { warnings } = autofillSpec({ title: 't' });
    expect(warnings).toEqual([]);
  });
});
