import { describe, it, expect, vi } from 'vitest';
import { loadDataBlocks, type LoadDataOptions } from './loadData';

const BLOCK = '```data\nsource: data/売上.tsv\n```';
const TSV = '月\t売上\n1月\t120';

function options(over: Partial<LoadDataOptions> = {}): LoadDataOptions {
  return {
    docPath: 'index.md',
    read: async () => TSV,
    describe: (problem) => `[${problem.kind}] ${problem.raw}`,
    ...over,
  };
}

describe('データの囲みを表へ差し替える', () => {
  it('指した表を Markdown の表にする', async () => {
    const out = await loadDataBlocks(BLOCK, options());
    expect(out.get(BLOCK)).toBe('| 月 | 売上 |\n| --- | --- |\n| 1月 | 120 |');
  });

  it('生の HTML を通す組み立てのときだけ、中身をそのまま渡す囲みを添える', async () => {
    const plain = await loadDataBlocks(BLOCK, options());
    expect(plain.get(BLOCK)).not.toContain('<script');

    const web = await loadDataBlocks(BLOCK, options({ rawHtml: true }));
    expect(web.get(BLOCK)).toContain('<script type="application/json"');
    expect(web.get(BLOCK)).toContain('data-source="data/売上.tsv"');
    // 表は web モードでも同じものが出る（読む人には表が要る）。
    expect(web.get(BLOCK)).toContain('| 1月 | 120 |');
  });

  it('フォルダの外を指したら断り、書いた指定はそのまま残す', async () => {
    const block = '```data\nsource: ../外.tsv\n```';
    const out = await loadDataBlocks(block, options());
    expect(out.get(block)).toBe(`> [bad-path] ../外.tsv\n\n${block}`);
  });

  it('読めなければ断る', async () => {
    const out = await loadDataBlocks(
      BLOCK,
      options({
        read: async () => {
          throw new Error('no such file');
        },
      }),
    );
    expect(out.get(BLOCK)).toContain('[read-failed] data/売上.tsv');
  });

  it('見出しだけで行が無ければ断る（空の表は読める形で嘘をつく）', async () => {
    const out = await loadDataBlocks(BLOCK, options({ read: async () => '月\t売上' }));
    expect(out.get(BLOCK)).toContain('[no-rows]');
  });

  it('指定が読めなければ、その囲みだけを断る', async () => {
    const block = '```data\nsauce: a.tsv\n```';
    const out = await loadDataBlocks(block, options());
    expect(out.get(block)).toContain('[unknown-key] sauce');
  });

  it('同じ表を指す囲みが並んでも、読むのは 1 度', async () => {
    const read = vi.fn(async () => TSV);
    const another = '```data\n# ふたつめ\nsource: data/売上.tsv\n```';
    const source = `${BLOCK}\n\n${another}`;
    await loadDataBlocks(source, options({ read }));
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('囲みが無ければ何も返さない（読みにも行かない）', async () => {
    const read = vi.fn(async () => TSV);
    const out = await loadDataBlocks('ふつうの本文', options({ read }));
    expect(out.size).toBe(0);
    expect(read).not.toHaveBeenCalled();
  });
});
