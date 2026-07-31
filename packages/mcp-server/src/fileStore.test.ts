import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { FileDocumentStore } from './fileStore.js';

/**
 * 書き込み中断を再現するための差し込み口。`partial` の間は要求された内容の前半だけを
 * 書いて例外を投げる（ディスク満杯・プロセス強制終了で起きる「中途半端なファイル」）。
 * vi.mock のファクトリはホイストされるため vi.hoisted で先に用意する。
 */
const writeControl = vi.hoisted(() => ({
  mode: 'normal' as 'normal' | 'partial',
  /** writeFile が実際に受け取ったパス（一時ファイル名の規則を検査するため）。 */
  targets: [] as string[],
}));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    writeFile: async (path: never, data: never, options: never) => {
      writeControl.targets.push(String(path));
      if (writeControl.mode !== 'partial') return actual.writeFile(path, data, options);
      const text = String(data);
      await actual.writeFile(path, text.slice(0, Math.ceil(text.length / 2)), options);
      throw new Error('書き込みを中断しました（テスト）');
    },
  };
});

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

/**
 * 行単位の書き込み（検証シート）は「全文を読んで全文を書き戻す」形なので、上書きの
 * 途中で落ちると 1 回でシート全体を失いうる。一時ファイルへ書いてから rename で
 * 差し替えることで、元ファイルは差し替わるまで最後まで元の内容のまま残す。
 */
describe('FileDocumentStore — 上書きの原子性', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'mdbiz-atomic-'));
    writeControl.targets = [];
  });

  afterEach(async () => {
    writeControl.mode = 'normal';
    await rm(root, { recursive: true, force: true });
  });

  it('書き込みが途中で失敗しても元の内容が残る', async () => {
    const store = new FileDocumentStore(root);
    await store.write('sheet.tsv', '元の内容');

    writeControl.mode = 'partial';
    await expect(store.write('sheet.tsv', '新しい内容をここへ書き込む')).rejects.toThrow();

    writeControl.mode = 'normal';
    expect(await store.read('sheet.tsv')).toBe('元の内容');
  });

  it('失敗しても一時ファイルを残さない', async () => {
    const store = new FileDocumentStore(root);
    await store.write('sheet.tsv', '元の内容');

    writeControl.mode = 'partial';
    await expect(store.write('sheet.tsv', '新しい内容をここへ書き込む')).rejects.toThrow();

    writeControl.mode = 'normal';
    expect(await readdir(root)).toEqual(['sheet.tsv']);
  });

  it('成功時も一時ファイルを残さない', async () => {
    const store = new FileDocumentStore(root);
    await store.write('doc.md', '一度目');
    await store.write('doc.md', '二度目');

    expect(await readdir(root)).toEqual(['doc.md']);
    expect(await store.read('doc.md')).toBe('二度目');
  });

  it('一時ファイルは同じディレクトリに置き、監視対象の拡張子にしない', async () => {
    const store = new FileDocumentStore(root);
    await store.write('sub/doc.md', '本文');

    // 実際に書いた先は目的のファイルではなく、同ディレクトリの一時ファイル。
    // デスクトップのファイル監視は .md / .tsv しか拾わないので、途中経過が
    // ファイル一覧に一瞬現れないよう拡張子を外す。
    const written = writeControl.targets.at(-1) ?? '';
    expect(dirname(written)).toBe(join(root, 'sub'));
    expect(written.endsWith('.md')).toBe(false);
    expect(written.endsWith('.tsv')).toBe(false);
  });
});

/**
 * アプリのフォルダ切り替えに追従するため、root は生成後に差し替えられる。
 * HTTP サーバーは store インスタンスを掴んだままなので、差し替えは同一インスタンス
 * 上で起きる必要がある（新しい store に作り替えると参照が古いままになる）。
 */
describe('FileDocumentStore — root の差し替え', () => {
  let first: string;
  let second: string;

  beforeEach(async () => {
    first = await mkdtemp(join(tmpdir(), 'mdbiz-root-a-'));
    second = await mkdtemp(join(tmpdir(), 'mdbiz-root-b-'));
  });

  afterEach(async () => {
    await rm(first, { recursive: true, force: true });
    await rm(second, { recursive: true, force: true });
  });

  it('差し替え後は新しい root を読み書きする', async () => {
    const store = new FileDocumentStore(first);
    await store.write('a.md', '旧');
    store.setRoot(second);

    expect(await store.exists('a.md')).toBe(false);
    await store.write('a.md', '新');
    expect(await store.read('a.md')).toBe('新');
    expect(await store.list()).toEqual(['a.md']);
  });

  it('同じインスタンスのまま root だけが変わる', async () => {
    const store = new FileDocumentStore(first);
    const held = store;
    store.setRoot(second);
    expect(held.getRoot()).toBe(resolve(second));
  });

  it('相対パス指定の root を絶対パスへ解決する', () => {
    const store = new FileDocumentStore(first);
    store.setRoot('.');
    expect(store.getRoot()).toBe(resolve('.'));
  });

  it('差し替え後も root 逸脱を拒否する', async () => {
    const store = new FileDocumentStore(first);
    store.setRoot(second);
    await expect(store.read('../outside.md')).rejects.toThrow(/ワークスペース外/);
  });
});
