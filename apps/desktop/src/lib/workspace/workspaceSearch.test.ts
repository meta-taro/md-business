import { describe, expect, it, vi } from 'vitest';
import { indexWorkspace } from '@md-business/explorer';
import { contentHits, readFilesForIndex } from './workspaceSearch';
import { toDocEntry } from './fileTree';

/** 途中で打ち切られない読み込み。null は打ち切りの試験だけで確かめる。 */
async function readAll(...args: Parameters<typeof readFilesForIndex>) {
  const r = await readFilesForIndex(...args);
  if (r === null) throw new Error('打ち切られた');
  return r;
}

const entries = ['docs/a.md', 'docs/b.tsv', 'img/logo.png', 'data/x.json'].map(toDocEntry);

describe('readFilesForIndex', () => {
  it('md と tsv だけ本文を読み、ほかは名前だけ載せる', async () => {
    const read = vi.fn(async (p: string) => `本文:${p}`);
    const r = await readAll(entries, read);
    expect(read.mock.calls.map((c) => c[0]).sort()).toEqual(['docs/a.md', 'docs/b.tsv']);
    expect(r.files).toEqual([
      { path: 'docs/a.md', text: '本文:docs/a.md' },
      { path: 'docs/b.tsv', text: '本文:docs/b.tsv' },
      { path: 'img/logo.png' },
      { path: 'data/x.json' },
    ]);
    expect(r.truncated).toBe(false);
  });

  it('読めなかったものも名前では残す', async () => {
    const r = await readAll(entries.slice(0, 1), async () => {
      throw new Error('denied');
    });
    expect(r.files).toEqual([{ path: 'docs/a.md' }]);
  });

  it('長い本文は切る', async () => {
    const r = await readAll(entries.slice(0, 1), async () => 'あ'.repeat(50), { maxChars: 10 });
    expect(r.files[0]?.text).toHaveLength(10);
  });

  it('本文を読む本数に上限を置き、超えたら切ったと返す', async () => {
    const many = Array.from({ length: 5 }, (_, i) => toDocEntry(`n${i}.md`));
    const read = vi.fn(async () => 'x');
    const r = await readAll(many, read, { maxReads: 3 });
    expect(read).toHaveBeenCalledTimes(3);
    expect(r.files).toHaveLength(5);
    expect(r.files.filter((f) => f.text !== undefined)).toHaveLength(3);
    expect(r.truncated).toBe(true);
  });

  it('同時に読む本数を超えない', async () => {
    const many = Array.from({ length: 10 }, (_, i) => toDocEntry(`n${i}.md`));
    let running = 0;
    let peak = 0;
    const read = async () => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 1));
      running -= 1;
      return '';
    };
    await readFilesForIndex(many, read, { concurrency: 3 });
    expect(peak).toBeLessThanOrEqual(3);
  });

  it('途中で古くなったら読むのをやめて null を返す', async () => {
    const many = Array.from({ length: 10 }, (_, i) => toDocEntry(`n${i}.md`));
    let stale = false;
    const read = vi.fn(async () => {
      stale = true;
      return '';
    });
    const r = await readFilesForIndex(many, read, { concurrency: 1, isStale: () => stale });
    expect(r).toBeNull();
    expect(read).toHaveBeenCalledTimes(1);
  });
});

describe('contentHits', () => {
  const index = indexWorkspace([
    { path: 'docs/倉庫.md', text: '' },
    { path: 'docs/a.md', text: '# 倉庫システム\n本文' },
    { path: 'docs/c.md', text: '途中で倉庫に触れる' },
  ]);

  it('ツリーにもう出ているものは除く', () => {
    const hits = contentHits(index, '倉庫', new Set(['docs/倉庫.md']));
    expect(hits.map((h) => h.path)).toEqual(['docs/a.md', 'docs/c.md']);
  });

  it('空の検索語では何も返さない', () => {
    expect(contentHits(index, ' ', new Set())).toEqual([]);
  });

  it('上限で切る', () => {
    expect(contentHits(index, '倉庫', new Set(), { limit: 1 })).toHaveLength(1);
  });
});
