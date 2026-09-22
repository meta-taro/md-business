import { describe, expect, it } from 'vitest';
import { collectFencedBlocks, replaceFencedBlocks } from './fencedBlocks';

const F = '```';

describe('collectFencedBlocks', () => {
  it('拾う', () => {
    const source = `前\n${F}zumen\nversion: 1\n${F}\n後`;
    expect(collectFencedBlocks(source, 'zumen')).toEqual([
      { raw: `${F}zumen\nversion: 1\n${F}`, body: 'version: 1' },
    ]);
  });

  it('改行が CRLF でも拾う', () => {
    const source = `前\r\n${F}zumen\r\nversion: 1\r\n${F}\r\n後`;
    const blocks = collectFencedBlocks(source, 'zumen');
    expect(blocks).toHaveLength(1);
    // 中身は読み手（YAML・題名の取り出し）へ渡るので改行を揃える。
    expect(blocks[0].body).toBe('version: 1');
  });

  it('CRLF でも目印は本文のとおりなので置き換えられる', () => {
    const source = `前\r\n${F}zumen\r\nversion: 1\r\n${F}\r\n後`;
    const blocks = collectFencedBlocks(source, 'zumen');
    expect(source).toContain(blocks[0].raw);
    const out = replaceFencedBlocks(source, new Map([[blocks[0].raw, '![図](x)']]));
    // 閉じの行の復帰文字ごと差し替わるので、置き換えた行だけ改行が LF になる。
    // 出来上がりは画面と PDF へ流すだけで、本文として書き戻さないので構わない。
    expect(out).toBe(`前\r\n![図](x)\n後`);
  });

  it('別の名前の囲みは拾わない', () => {
    const source = `${F}mermaid\r\ngraph LR\r\n${F}\r\n`;
    expect(collectFencedBlocks(source, 'zumen')).toEqual([]);
  });

  it('囲みの中の囲みは中身として読む', () => {
    const source = `~~~zumen\r\n${F}\r\nversion: 1\r\n${F}\r\n~~~\r\n`;
    const blocks = collectFencedBlocks(source, 'zumen');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].body).toBe(`${F}\nversion: 1\n${F}`);
  });
});
