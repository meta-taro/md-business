import { describe, it, expect } from 'vitest';
import { MemoryDocumentStore } from './store.js';

/**
 * DocumentStore は MCP ツールとファイル I/O の境界。テストと dry-run は
 * インメモリ実装（MemoryDocumentStore）で回し、本番は fs 実装へ
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

  it('list は文書（.md）だけをソートして返す', async () => {
    // 検証シートは frontmatter を持たないので、文書の走査に混ぜると解析が空振りする。
    const store = new MemoryDocumentStore({ 'b.md': '', 'a.md': '', 'sheets/s.tsv': '' });
    await store.write('c.md', '');
    expect(await store.list()).toEqual(['a.md', 'b.md', 'c.md']);
  });

  it('listSheets は検証シート（.tsv）だけをソートして返す', async () => {
    const store = new MemoryDocumentStore({ 'z.tsv': '', 'a.md': '', 'sheets/s.tsv': '' });
    expect(await store.listSheets()).toEqual(['sheets/s.tsv', 'z.tsv']);
  });

  it('listSite は文書でも検証シートでもないものをソートして返す', async () => {
    // サイトの部品には形（スキーマ）が無いので、拡張子ごとの走査では拾えない。
    const store = new MemoryDocumentStore({
      'index.html': '',
      'a.md': '',
      'sheets/s.tsv': '',
      'assets/app.js': '',
    });
    expect(await store.listSite()).toEqual(['assets/app.js', 'index.html']);
  });

  /**
   * lines は調査ツールの読み口。fs 実装ではストリームで流すので、インメモリ側も
   * 同じ切り方（改行を含まない / 末尾の改行で空行を増やさない）に揃えておかないと、
   * テストで通った行番号が本番でずれる。
   */
  describe('lines', () => {
    async function collect(source: AsyncIterable<string>): Promise<string[]> {
      const out: string[] = [];
      for await (const line of source) out.push(line);
      return out;
    }

    it('改行文字を含まない行を順に流す', async () => {
      const store = new MemoryDocumentStore({ 'app.log': 'a\nb\nc' });
      expect(await collect(store.lines('app.log'))).toEqual(['a', 'b', 'c']);
    });

    it('CRLF でも同じ結果になる', async () => {
      const store = new MemoryDocumentStore({ 'app.log': 'a\r\nb\r\n' });
      expect(await collect(store.lines('app.log'))).toEqual(['a', 'b']);
    });

    it('末尾の改行で空行を増やさない', async () => {
      const store = new MemoryDocumentStore({ 'app.log': 'a\nb\n' });
      expect(await collect(store.lines('app.log'))).toEqual(['a', 'b']);
    });

    it('空ファイルは 1 行も流さない', async () => {
      const store = new MemoryDocumentStore({ 'empty.log': '' });
      expect(await collect(store.lines('empty.log'))).toEqual([]);
    });

    it('存在しないファイルは reject する', async () => {
      const store = new MemoryDocumentStore();
      await expect(collect(store.lines('missing.log'))).rejects.toThrow();
    });
  });
});
