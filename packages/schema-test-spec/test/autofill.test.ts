import { describe, it, expect } from 'vitest';
import { autofillTestSpec } from '../src/index.js';

describe('autofillTestSpec — input guards', () => {
  it('returns empty data for non-objects', () => {
    expect(autofillTestSpec(null).data).toEqual({});
    expect(autofillTestSpec(undefined).data).toEqual({});
    expect(autofillTestSpec('x').data).toEqual({});
    expect(autofillTestSpec([1, 2]).data).toEqual({});
  });
});

describe('autofillTestSpec — defaults', () => {
  it('fills schema / version / status on a bare object', () => {
    const { data, warnings } = autofillTestSpec({});
    expect(data).toMatchObject({
      schema: 'test-spec/v1',
      version: '0.1.0',
      status: 'draft',
    });
    expect(warnings).toEqual([]);
  });

  it('does not overwrite explicit values', () => {
    const { data } = autofillTestSpec({
      schema: 'test-spec/v1',
      version: '1.2.3',
      status: 'completed',
    });
    expect(data).toMatchObject({
      version: '1.2.3',
      status: 'completed',
    });
  });

  it('treats empty strings as missing for version/status', () => {
    const { data } = autofillTestSpec({ version: '', status: '' });
    expect(data.version).toBe('0.1.0');
    expect(data.status).toBe('draft');
  });

  it('does not mutate the input object', () => {
    const input: Record<string, unknown> = { title: 't' };
    const { data } = autofillTestSpec(input);
    expect(input).toEqual({ title: 't' });
    expect(data).not.toBe(input);
  });
});

describe('autofillTestSpec — column-level warnings', () => {
  it('warns on duplicate column names', () => {
    const { warnings } = autofillTestSpec({
      columns: [
        { name: '項目', type: 'text' },
        { name: '項目', type: 'text' },
      ],
    });
    expect(warnings.some((w) => w.path === 'columns[1].name')).toBe(true);
  });

  it('warns when type=enum has no values', () => {
    const { warnings } = autofillTestSpec({
      columns: [{ name: '結果', type: 'enum' }],
    });
    expect(warnings.some((w) => w.path === 'columns[0].values')).toBe(true);
  });

  it('warns when type=enum has empty values array', () => {
    const { warnings } = autofillTestSpec({
      columns: [{ name: '結果', type: 'enum', values: [] }],
    });
    expect(warnings.some((w) => w.path === 'columns[0].values')).toBe(true);
  });

  it('does not warn when type=enum has at least one value', () => {
    const { warnings } = autofillTestSpec({
      columns: [{ name: '結果', type: 'enum', values: ['OK'] }],
    });
    expect(warnings).toEqual([]);
  });

  it('warns when a visual key is not declared in values', () => {
    const { warnings } = autofillTestSpec({
      columns: [
        {
          name: '結果',
          type: 'enum',
          values: ['OK', 'NG'],
          visual: { OK: { background: '#fff' }, '保留': { background: '#fef' } },
        },
      ],
    });
    expect(warnings.some((w) => w.path === 'columns[0].visual.保留')).toBe(true);
  });
});
