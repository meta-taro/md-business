import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileDocumentStore } from './fileStore.js';

/**
 * FileDocumentStore は DocumentStore の本番実装（node:fs）。ここだけ実ファイル I/O を
 * temp ディレクトリ相手に検証する（MemoryDocumentStore で契約は担保済みなので、
 * fs 特有の点＝相対パス解決・root 逸脱防御・再帰 list・親ディレクトリ生成を見る）。
 */
describe('FileDocumentStore', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'mdbiz-store-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('write した内容を read で取り出せる（親ディレクトリ自動生成）', async () => {
    const store = new FileDocumentStore(root);
    await store.write('invoices/new.md', '# 請求書');
    expect(await store.read('invoices/new.md')).toBe('# 請求書');
  });

  it('存在しない read は reject する', async () => {
    const store = new FileDocumentStore(root);
    await expect(store.read('nope.md')).rejects.toThrow();
  });

  it('exists は有無を返す', async () => {
    const store = new FileDocumentStore(root);
    expect(await store.exists('x.md')).toBe(false);
    await store.write('x.md', '');
    expect(await store.exists('x.md')).toBe(true);
  });

  it('list は .md を再帰収集し / 区切りの相対パスでソートして返す', async () => {
    await mkdir(join(root, 'a', 'b'), { recursive: true });
    await writeFile(join(root, 'z.md'), '');
    await writeFile(join(root, 'a', 'm.md'), '');
    await writeFile(join(root, 'a', 'b', 'deep.md'), '');
    await writeFile(join(root, 'a', 'ignore.txt'), ''); // .md 以外は無視
    const store = new FileDocumentStore(root);
    expect(await store.list()).toEqual(['a/b/deep.md', 'a/m.md', 'z.md']);
  });

  it('root 外へ逃げる相対パスは拒否する（多重防御）', async () => {
    const store = new FileDocumentStore(root);
    await expect(store.read('../escape.md')).rejects.toThrow();
    await expect(store.write('../escape.md', 'x')).rejects.toThrow();
  });
});
