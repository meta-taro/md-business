import { describe, expect, it, vi } from 'vitest';
import { loadZumenImages } from './zumenBlocks';

/** SVG から data URL を戻して中身を見る。 */
function decode(markup: string): string {
  const found = /\(data:image\/svg\+xml;base64,([^)\s]+)/.exec(markup);
  if (found === null) throw new Error(`画像になっていない: ${markup}`);
  return atob(found[1]);
}

const SVG = '<svg width="120" height="60" viewBox="0 0 120 60"><rect /></svg>';

describe('loadZumenImages', () => {
  const describeFailure = (message: string) => `図を描けませんでした（${message}）`;

  it('囲みを画像の記法へ替える', async () => {
    const source = ['# 見出し', '', '```zumen', 'version: 1', 'title: 本番構成', '```', ''].join(
      '\n',
    );
    const render = vi.fn().mockResolvedValue(SVG);

    const out = await loadZumenImages(source, {
      theme: 'light',
      render,
      describe: describeFailure,
    });

    expect(out.size).toBe(1);
    const [[raw, replacement]] = [...out];
    expect(raw).toContain('```zumen');
    expect(decode(replacement)).toBe(SVG);
    expect(render).toHaveBeenCalledWith('version: 1\ntitle: 本番構成', 'light');
  });

  it('描けなかったら、理由をその位置に出し、書いた指定も残す', async () => {
    // 黙って空にすると、書いた人は「描けている」と思ったまま気づかない。
    const source = ['```zumen', 'nodes: []', '```'].join('\n');
    const render = vi.fn().mockRejectedValue(new Error('nodes が空です'));

    const out = await loadZumenImages(source, {
      theme: 'light',
      render,
      describe: describeFailure,
    });

    const replacement = [...out.values()][0];
    expect(replacement).toContain('図を描けませんでした（nodes が空です）');
    expect(replacement).toContain('```zumen');
    expect(replacement).toContain('nodes: []');
  });

  it('同じ図が並んでも描くのは 1 度だけ', async () => {
    // 囲みが同じ文字列だと 1 つに畳まれるので、記号の数を変えて別の囲みにする。
    // 中身は同じなので、描くのは 1 度で足りる。
    const source = [
      '```zumen',
      'version: 1',
      '```',
      '',
      '````zumen',
      'version: 1',
      '````',
    ].join('\n');
    const render = vi.fn().mockResolvedValue(SVG);

    await loadZumenImages(source, { theme: 'light', render, describe: describeFailure });

    expect(render).toHaveBeenCalledTimes(1);
  });

  it('中身の無い囲みには触らない', async () => {
    const source = ['```zumen', '', '```'].join('\n');
    const render = vi.fn().mockResolvedValue(SVG);

    const out = await loadZumenImages(source, { theme: 'light', render, describe: describeFailure });

    expect(out.size).toBe(0);
    expect(render).not.toHaveBeenCalled();
  });

  it('囲みが無ければ描き手を呼ばない', async () => {
    const render = vi.fn().mockResolvedValue(SVG);

    const out = await loadZumenImages('# 見出しだけ', {
      theme: 'light',
      render,
      describe: describeFailure,
    });

    expect(out.size).toBe(0);
    expect(render).not.toHaveBeenCalled();
  });

  it('暗いテーマはそのまま描き手へ渡す', async () => {
    // 書き出した SVG は CSS 変数を使えないので、色はここで決まらない。渡さないと直せない。
    const render = vi.fn().mockResolvedValue(SVG);

    await loadZumenImages('```zumen\nversion: 1\n```', {
      theme: 'dark',
      render,
      describe: describeFailure,
    });

    expect(render).toHaveBeenCalledWith('version: 1', 'dark');
  });

  it('図の題名を説明にする', async () => {
    // 説明は読み上げと、画像が出ないときの代わりに出る文字になる。構成図の 1 行目は
    // `version: 1` で、どの図なのかを何も伝えない。
    const source = ['```zumen', 'version: 1', 'title: 本番構成', '```'].join('\n');
    const render = vi.fn().mockResolvedValue(SVG);

    const out = await loadZumenImages(source, { theme: 'light', render, describe: describeFailure });

    expect([...out.values()][0]).toMatch(/^!\[本番構成\]\(/);
  });

  it('題名が無ければ、いちばん上の行を説明にする', async () => {
    const source = ['```zumen', 'version: 1', 'nodes: []', '```'].join('\n');
    const render = vi.fn().mockResolvedValue(SVG);

    const out = await loadZumenImages(source, { theme: 'light', render, describe: describeFailure });

    expect([...out.values()][0]).toMatch(/^!\[version: 1\]\(/);
  });

  it('図の中の部品に付いた題名は拾わない', async () => {
    // `title` は部品にも書ける。拾うのは図そのものの題名だけ。
    const source = [
      '```zumen',
      'version: 1',
      'nodes:',
      '  - id: a',
      '    title: 部品の名前',
      '```',
    ].join('\n');
    const render = vi.fn().mockResolvedValue(SVG);

    const out = await loadZumenImages(source, { theme: 'light', render, describe: describeFailure });

    expect([...out.values()][0]).toMatch(/^!\[version: 1\]\(/);
  });

  it('図の題名を、図の下に出す説明としても渡す', async () => {
    // 題名は説明（alt）にもなるが、それは画像が出ないときの代わり。図のそばで
    // 「何の図か」を読めるように、本文の側でも題名として渡す。
    const source = ['```zumen', 'version: 1', 'title: 本番構成', '```'].join('\n');
    const render = vi.fn().mockResolvedValue(SVG);

    const out = await loadZumenImages(source, { theme: 'light', render, describe: describeFailure });

    expect([...out.values()][0]).toMatch(/ "本番構成"\)$/);
  });

  it('題名が無ければ説明は付けない', async () => {
    const source = ['```zumen', 'version: 1', 'nodes: []', '```'].join('\n');
    const render = vi.fn().mockResolvedValue(SVG);

    const out = await loadZumenImages(source, { theme: 'light', render, describe: describeFailure });

    expect([...out.values()][0]).not.toContain('"');
  });

  it('題名に引用符が入っていても記法が閉じない', async () => {
    const source = ['```zumen', 'version: 1', 'title: A "B" C', '```'].join('\n');
    const render = vi.fn().mockResolvedValue(SVG);

    const out = await loadZumenImages(source, { theme: 'light', render, describe: describeFailure });

    expect([...out.values()][0]).toMatch(/ "A \\"B\\" C"\)$/);
  });

  it('大きさが割合で書かれていたら、viewBox の値を実寸として入れる', async () => {
    // 画像として貼ると外側の幅が伝わらないので、割合では大きさが決まらない。
    const render = vi.fn().mockResolvedValue('<svg width="100%" viewBox="0 0 120 60"></svg>');

    const out = await loadZumenImages('```zumen\nversion: 1\n```', {
      theme: 'light',
      render,
      describe: describeFailure,
    });

    const svg = decode([...out.values()][0]);
    expect(svg).toContain('width="120"');
    expect(svg).toContain('height="60"');
  });
});
