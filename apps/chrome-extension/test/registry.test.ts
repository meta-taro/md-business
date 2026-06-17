import { describe, it, expect } from 'vitest';
import { PluginRegistry } from '../src/plugins/registry.js';
import { invoicePlugin } from '../src/plugins/invoice.js';
import { specPlugin } from '../src/plugins/spec.js';
import { createDefaultRegistry } from '../src/plugins/index.js';
import type { SchemaPlugin } from '../src/plugins/types.js';

function dummyPlugin(id: string): SchemaPlugin {
  return {
    id,
    label: id,
    schema: { type: 'object' },
    stylesHref: `styles/${id}.css`,
    validate: (frontmatter) => ({ ok: true, data: frontmatter }),
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

  it('falls back to plugin.detect() when no schema field is present', () => {
    const r = new PluginRegistry();
    const detectingPlugin: SchemaPlugin = {
      ...dummyPlugin('marker-schema'),
      detect: (fm) => '請求書番号' in fm,
    };
    r.register(detectingPlugin);
    expect(r.resolve({ 請求書番号: 'INV-1' })?.id).toBe('marker-schema');
    expect(r.resolve({ unrelated: 'no' })).toBeUndefined();
  });
});

describe('invoicePlugin.detect', () => {
  it('claims documents with Japanese marker keys', () => {
    expect(invoicePlugin.detect?.({ 請求書番号: 'INV-1' })).toBe(true);
    expect(invoicePlugin.detect?.({ 品目: [] })).toBe(true);
    expect(invoicePlugin.detect?.({ 発行元: {} })).toBe(true);
  });

  it('claims documents with English marker keys', () => {
    expect(invoicePlugin.detect?.({ invoiceNumber: 'X' })).toBe(true);
    expect(invoicePlugin.detect?.({ items: [] })).toBe(true);
  });

  it('does not claim unrelated documents', () => {
    expect(invoicePlugin.detect?.({ title: 'just a note' })).toBe(false);
  });
});

describe('specPlugin.detect', () => {
  it('claims documents with Japanese marker keys', () => {
    expect(specPlugin.detect?.({ 文書番号: 'SPEC-1' })).toBe(true);
    expect(specPlugin.detect?.({ 章ファイル: [] })).toBe(true);
    expect(specPlugin.detect?.({ レビュアー: [] })).toBe(true);
  });

  it('claims documents with English marker keys', () => {
    expect(specPlugin.detect?.({ documentNumber: 'X' })).toBe(true);
    expect(specPlugin.detect?.({ chapters: [] })).toBe(true);
    expect(specPlugin.detect?.({ reviewers: [] })).toBe(true);
  });

  it('does not claim unrelated documents', () => {
    expect(specPlugin.detect?.({ title: 'note' })).toBe(false);
    expect(specPlugin.detect?.({ items: [], 請求書番号: 'X' })).toBe(false);
  });
});

describe('createDefaultRegistry', () => {
  it('ships with the invoice and spec plugins', () => {
    const r = createDefaultRegistry();
    expect(r.get('invoice')).toBe(invoicePlugin);
    expect(r.get('spec')).toBe(specPlugin);
    expect(r.list().map((p) => p.id)).toEqual(['invoice', 'spec']);
  });
});
