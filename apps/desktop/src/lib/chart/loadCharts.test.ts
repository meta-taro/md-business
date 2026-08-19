import { describe, expect, it, vi } from 'vitest';
import { loadCharts } from './loadCharts';
import type { ChartLoadProblem } from './loadCharts';

const FENCE = '```';

const TSV = '日付\tセッション\n1日\t10\n2日\t20\n';

function chart(body: string): string {
  return `${FENCE}chart\n${body}\n${FENCE}`;
}

const SPEC = 'type: line\nsource: ./a.tsv\nx: 日付\ny: セッション';

function describeProblem(problem: ChartLoadProblem): string {
  return `[${problem.kind}]${problem.raw}`;
}

function load(
  source: string,
  overrides: { docPath?: string | null; read?: (path: string) => Promise<string> } = {},
) {
  return loadCharts(source, {
    docPath: overrides.docPath === undefined ? 'docs/月報.md' : overrides.docPath,
    read: overrides.read ?? (() => Promise.resolve(TSV)),
    describe: describeProblem,
  });
}

function decode(markup: string): string {
  const base64 = /base64,([^)]+)\)/.exec(markup);
  if (base64 === null) throw new Error(`画像になっていない: ${markup}`);
  return new TextDecoder().decode(Uint8Array.from(atob(base64[1]), (c) => c.charCodeAt(0)));
}

describe('図を読み込む', () => {
  it('指定どおりに描いたものを画像として返す', async () => {
    const block = chart(`${SPEC}\ntitle: セッション推移`);
    const out = await load(block);
    const markup = out.get(block);
    expect(markup).toBeDefined();
    expect(markup).toContain('![セッション推移](data:image/svg+xml;base64,');
    expect(decode(markup ?? '')).toContain('<svg');
  });

  it('題名が無ければ列の名前で呼ぶ', async () => {
    const out = await load(chart(SPEC));
    expect([...out.values()][0]).toContain('![セッション]');
  });

  it('文字色を渡すと図に乗る', async () => {
    const out = await loadCharts(chart(SPEC), {
      docPath: 'docs/月報.md',
      read: () => Promise.resolve(TSV),
      describe: describeProblem,
      ink: '#e6edf3',
    });
    expect(decode([...out.values()][0])).toContain('#e6edf3');
  });

  it('図が無ければ何も返さない', async () => {
    const out = await load('ただの本文');
    expect(out.size).toBe(0);
  });
});

describe('描けないときは理由を出す', () => {
  it('指定が壊れていれば理由と元の指定を残す', async () => {
    const block = chart('type: line\nsource: ./a.tsv');
    const out = await load(block);
    expect(out.get(block)).toContain('[missing]');
    // 元の指定を消すと、何を書いたのかが本人にも分からなくなる。
    expect(out.get(block)).toContain('source: ./a.tsv');
  });

  it('読めなければ理由に指定した場所を出す', async () => {
    const out = await load(chart(SPEC), {
      read: () => Promise.reject(new Error('no such file')),
    });
    expect([...out.values()][0]).toContain('[read-failed]./a.tsv');
  });

  it('フォルダの外を指していれば解かない', async () => {
    const read = vi.fn(() => Promise.resolve(TSV));
    const out = await load(chart('type: line\nsource: ../../外.tsv\nx: 日付\ny: セッション'), {
      read,
    });
    expect([...out.values()][0]).toContain('[bad-path]');
    expect(read).not.toHaveBeenCalled();
  });

  it('文書の置き場が分からなければ解かない', async () => {
    const out = await load(chart(SPEC), { docPath: null });
    expect([...out.values()][0]).toContain('[bad-path]');
  });

  it('指定した列が表に無ければ言う', async () => {
    const out = await load(chart('type: line\nsource: ./a.tsv\nx: 日付\ny: 売上'));
    expect([...out.values()][0]).toContain('[no-column]売上');
  });

  it('読めないセルがあれば図に断りを添える', async () => {
    const out = await load(chart(SPEC), {
      read: () => Promise.resolve('日付\tセッション\n1日\t10\n2日\t不明\n'),
    });
    const markup = [...out.values()][0];
    expect(markup).toContain('data:image/svg+xml;base64,');
    expect(markup).toContain('[unreadable-cells]1');
  });

  it('理由に改行が混ざっても 1 行に収める', async () => {
    const out = await loadCharts(chart(SPEC), {
      docPath: null,
      read: () => Promise.resolve(TSV),
      describe: () => '上の行\n下の行',
    });
    expect([...out.values()][0]).toContain('> 上の行 下の行');
  });
});

describe('同じ表を何度も読まない', () => {
  it('2 つの図が同じ表を指していれば読むのは 1 度', async () => {
    const read = vi.fn(() => Promise.resolve(TSV));
    const first = chart(SPEC);
    const second = chart(`${SPEC}\ntype: bar`.replace('type: line\n', ''));
    await load(`${first}\n\n${second}`, { read });
    expect(read).toHaveBeenCalledTimes(1);
  });
});
