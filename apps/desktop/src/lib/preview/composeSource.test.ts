import { describe, expect, it, vi } from 'vitest';
import { composeExportSource } from './composeSource';

const FENCE = '```';
const TSV = '月\t売上\n1月\t10\n2月\t20\n';
const CHART = `${FENCE}chart\ntype: line\nsource: ./売上.tsv\nx: 月\ny: 売上\n${FENCE}`;
const DATA = `${FENCE}data\nsource: ./売上.tsv\n${FENCE}`;

function compose(
  source: string,
  overrides: {
    readImage?: (path: string) => Promise<string>;
    readText?: (path: string) => Promise<string>;
    rawHtml?: boolean;
  } = {},
) {
  return composeExportSource(source, {
    docPath: 'docs/月報.md',
    io: {
      readImage: overrides.readImage ?? (() => Promise.resolve('data:image/png;base64,AAA')),
      readText: overrides.readText ?? (() => Promise.resolve(TSV)),
    },
    describe: (problem) => `[${problem.kind}]`,
    describeData: (problem) => `[${problem.kind}]`,
    rawHtml: overrides.rawHtml,
  });
}

describe('書き出す本文を仕上げる', () => {
  it('作図も画像にする', async () => {
    const diagram = `${FENCE}mermaid
graph TD
  A --> B
${FENCE}`;
    const out = await composeExportSource(diagram, {
      docPath: 'docs/月報.md',
      io: { readText: () => Promise.resolve(TSV) },
      describe: (problem) => `[${problem.kind}]`,
      describeData: (problem) => `[${problem.kind}]`,
      mermaid: {
        theme: 'light',
        render: () =>
          Promise.resolve('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"></svg>'),
      },
    });
    expect(out).toContain('](data:image/svg+xml;base64,');
    expect(out).not.toContain(`${FENCE}mermaid`);
  });

  it('画像の読み取りを渡さなければ本文の画像はそのまま（サイトはファイルで運ぶ）', async () => {
    const out = await composeExportSource('![図](./a.png)', {
      docPath: 'docs/月報.md',
      io: { readText: () => Promise.resolve(TSV) },
      describe: (problem) => `[${problem.kind}]`,
      describeData: (problem) => `[${problem.kind}]`,
    });
    expect(out).toBe('![図](./a.png)');
  });

  it('本文が指している画像を埋め込む', async () => {
    const out = await compose('![図](./a.png)');
    expect(out).toContain('![図](data:image/png;base64,AAA)');
  });

  it('図の囲みを描いた画像に替える', async () => {
    const out = await compose(CHART);
    expect(out).toContain('](data:image/svg+xml;base64,');
    expect(out).not.toContain(`${FENCE}chart`);
  });

  it('データの囲みを表に替える', async () => {
    const out = await compose(DATA);
    expect(out).toContain('| 月 | 売上 |');
    expect(out).toContain('| 1月 | 10 |');
    expect(out).not.toContain(`${FENCE}data`);
  });

  it('生の HTML が通る組み立てなら、中身をそのまま渡す囲みも添える', async () => {
    const out = await compose(DATA, { rawHtml: true });
    expect(out).toContain('<script type="application/json" data-source="./売上.tsv">');
    expect(out).toContain('"売上":"10"');
  });

  it('通らない組み立てには添えない（落とされるものを本文に混ぜない）', async () => {
    const out = await compose(DATA);
    expect(out).not.toContain('<script');
  });

  it('画像と図が両方あってもどちらも入る', async () => {
    const out = await compose(`![図](./a.png)\n\n${CHART}`);
    expect(out).toContain('data:image/png;base64,AAA');
    expect(out).toContain('data:image/svg+xml;base64,');
  });

  it('画像が読めなくても書き出しは止まらない', async () => {
    const out = await compose('![図](./a.png)', {
      readImage: () => Promise.reject(new Error('no such file')),
    });
    expect(out).toBe('![図](./a.png)');
  });

  it('図が読めなければ理由を残す', async () => {
    const out = await compose(CHART, { readText: () => Promise.reject(new Error('no such file')) });
    expect(out).toContain('[read-failed]');
  });

  it('画像も図も無ければ本文をそのまま返す', async () => {
    const readImage = vi.fn(() => Promise.resolve('data:image/png;base64,AAA'));
    const readText = vi.fn(() => Promise.resolve(TSV));
    const out = await compose('ただの本文', { readImage, readText });
    expect(out).toBe('ただの本文');
    expect(readImage).not.toHaveBeenCalled();
    expect(readText).not.toHaveBeenCalled();
  });
});
