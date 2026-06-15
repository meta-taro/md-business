import { describe, it, expect } from 'vitest';
import { PluginRegistry } from '../src/plugins/registry.js';
import { invoicePlugin } from '../src/plugins/invoice.js';
import { createDefaultRegistry } from '../src/plugins/index.js';
import type { SchemaPlugin } from '../src/plugins/types.js';

function dummyPlugin(id: string): SchemaPlugin {
  return {
    id,
    label: id,
    schema: { type: 'object' },
    stylesHref: `styles/${id}.css`,
    render: () => `<div data-id="${id}"></div>`,
  };
}

describe('PluginRegistry', () => {
  it('registers and lists plugins', () => {
    const r = new PluginRegistry();
    r.register(dummyPlugin('a'));
    r.register(dummyPlugin('b'));
    expect(r.list().map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('throws on duplicate id', () => {
    const r = new PluginRegistry();
    r.register(dummyPlugin('a'));
    expect(() => r.register(dummyPlugin('a'))).toThrow(/already registered/);
  });

  it('resolves via explicit schema field', () => {
    const r = new PluginRegistry();
    r.register(dummyPlugin('invoice'));
    expect(r.resolve({ schema: 'invoice' })?.id).toBe('invoice');
  });

  it('resolves via schemaVersion prefix', () => {
    const r = new PluginRegistry();
    r.register(dummyPlugin('invoice'));
    expect(r.resolve({ schemaVersion: 'invoice/v1' })?.id).toBe('invoice');
  });

  it('returns undefined when nothing matches', () => {
    const r = new PluginRegistry();
    r.register(dummyPlugin('invoice'));
    expect(r.resolve({ foo: 'bar' })).toBeUndefined();
    expect(r.resolve({ schema: 'design-doc' })).toBeUndefined();
  });

  it('prefers explicit schema field over schemaVersion', () => {
    const r = new PluginRegistry();
    r.register(dummyPlugin('invoice'));
    r.register(dummyPlugin('design-doc'));
    expect(
      r.resolve({ schema: 'design-doc', schemaVersion: 'invoice/v1' })?.id,
    ).toBe('design-doc');
  });
});

describe('createDefaultRegistry', () => {
  it('ships with the invoice plugin', () => {
    const r = createDefaultRegistry();
    expect(r.get('invoice')).toBe(invoicePlugin);
    expect(r.list().map((p) => p.id)).toContain('invoice');
  });
});
