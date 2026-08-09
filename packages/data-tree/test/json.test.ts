import { describe, it, expect } from 'vitest';
import { readJsonTree } from '../src/index.js';

describe('readJsonTree', () => {
  it('turns an object into named children', () => {
    const result = readJsonTree('{"name":"acme","count":3}');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.root.children.map((c) => c.name)).toEqual(['name', 'count']);
    expect(result.root.children[0]).toMatchObject({ value: 'acme', valueType: 'string' });
    expect(result.root.children[1]).toMatchObject({ value: '3', valueType: 'number' });
  });

  it('names array children by position', () => {
    const result = readJsonTree('["a","b"]');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.root.children.map((c) => c.name)).toEqual(['0', '1']);
  });

  it('keeps null and boolean apart from the strings that spell them', () => {
    const result = readJsonTree('{"a":null,"b":false,"c":"null"}');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [a, b, c] = result.root.children;
    expect(a?.valueType).toBe('null');
    expect(b).toMatchObject({ valueType: 'boolean', value: 'false' });
    expect(c).toMatchObject({ valueType: 'string', value: 'null' });
  });

  it('accepts a scalar at the top level', () => {
    const result = readJsonTree('42');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.root).toMatchObject({ value: '42', valueType: 'number', children: [] });
  });

  it('reports broken syntax with a reason', () => {
    const result = readJsonTree('{"a":}');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problem.kind).toBe('syntax');
    expect(result.problem.message).not.toBe('');
  });

  it('refuses nesting past the depth limit instead of overflowing the stack', () => {
    let text = 'null';
    for (let i = 0; i < 50_000; i += 1) text = `[${text}]`;
    const result = readJsonTree(text);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problem.kind).toBe('depth');
  });

  it('refuses more values than the node limit allows', () => {
    const result = readJsonTree(JSON.stringify(Array.from({ length: 40 }, (_, i) => i)), {
      maxNodes: 10,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problem.kind).toBe('nodes');
  });

  it('refuses input larger than the size limit before parsing it', () => {
    const result = readJsonTree(`"${'x'.repeat(200)}"`, { maxChars: 100 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problem.kind).toBe('size');
  });

  it('keeps empty containers as leaves with no value', () => {
    const result = readJsonTree('{"a":{},"b":[]}');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.root.children.map((c) => c.children.length)).toEqual([0, 0]);
    expect(result.root.children[0]?.value).toBeUndefined();
  });
});
