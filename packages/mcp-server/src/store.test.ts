import { describe, it, expect } from 'vitest';
import { MemoryDocumentStore } from './store.js';

/**
 * DocumentStore は MCP ツールとファイル I/O の境界。テストと dry-run は
 * インメモリ実装（MemoryDocumentStore）で回し、本番は fs 実装（Block MCP-6）へ
 * 差し替える。ここでは境界の契約（read/write/exists/list）を検証する。
 */
describe('MemoryDocumentStore', () => {
  it('seed した内容を read できる', async () => {
    const store = new MemoryDocumentStore({ 'a.md': 'hello' });
    expect(await store.read('a.md')).toBe('hello');
  });

  it('存在しない read は reject する', async () => {
    const store = new MemoryDocumentStore();
    await expect(store.read('missing.md')).rejects.toThrow();
  });

  it('write した内容を read で取り出せる（上書き含む）', async () => {
    const store = new MemoryDocumentStore();
    await store.write('b.md', 'v1');
    expect(await store.read('b.md')).toBe('v1');
    await store.write('b.md', 'v2');
    expect(await store.read('b.md')).toBe('v2');
  });

  it('exists は有無を返す', async () => {
    const store = new MemoryDocumentStore({ 'x.md': '' });
    expect(await store.exists('x.md')).toBe(true);
    expect(await store.exists('y.md')).toBe(false);
  });

  it('list は全パスをソートして返す', async () => {
    const store = new MemoryDocumentStore({ 'b.md': '', 'a.md': '' });
    await store.write('c.md', '');
    expect(await store.list()).toEqual(['a.md', 'b.md', 'c.md']);
  });
});
