/**
 * テーマトークン（tokens.css）の書き方を守るためのテスト。
 *
 * CSS は型検査も svelte-check も素通りするため、値の作り方を間違えても
 * ビルドは通ってしまう。ここでは「実際に壊れた書き方」だけを機械的に止める。
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (relative: string): string =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');

/** `:root` を含むセレクタのブロック本体を列挙する（ライト既定 / ダーク上書きの両方）。 */
function rootBlocks(css: string): { selector: string; body: string }[] {
  // コメントにも `:root` や `var(…)` の説明が書かれるので、先に落としてから走査する。
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const blocks: { selector: string; body: string }[] = [];
  // 宣言だけを持つ平坦なブロックを拾う（入れ子の at-rule は中の規則だけが引っ掛かる）。
  const pattern = /([^{}]+)\{([^{}]*)\}/g;
  let match = pattern.exec(stripped);
  while (match !== null) {
    const selector = match[1].trim();
    if (selector.includes(':root')) blocks.push({ selector, body: match[2] });
    match = pattern.exec(stripped);
  }
  return blocks;
}

/** 行ごとにインラインで入る custom property（`:root` からは見えない）。 */
const PER_ROW_PROPERTIES = ['--row-tint'];

describe('tokens.css', () => {
  const css = read('./tokens.css');

  it('ライトとダークの両方を定義している', () => {
    const selectors = rootBlocks(css).map((b) => b.selector);
    expect(selectors).toContain(':root');
    expect(selectors).toContain(":root[data-theme='dark']");
  });

  // var() は「宣言された要素」で解決される。行ごとにインラインで入る値を :root 側の
  // トークンから参照すると、:root では未設定なのでフォールバック（＝色なし）に確定し、
  // その結果が全行へ継承される。テーマを問わず行色が消えるので、書き方ごと禁じる。
  it.each(PER_ROW_PROPERTIES)('%s を :root のトークンから参照しない', (property) => {
    const offenders = rootBlocks(css)
      .filter((b) => b.body.includes(`var(${property}`))
      .map((b) => b.selector);
    expect(offenders).toEqual([]);
  });
});

describe('TsvGrid.svelte の行背景', () => {
  const svelte = read('../tsv/TsvGrid.svelte');

  // 行色の組み立ては --row-tint が実際に入る行側でしか成立しない。
  it('行側で --row-tint から組み立てる', () => {
    expect(svelte).toContain('var(--row-tint');
  });

  it('テーマ側で組み立て済みの色を受け取らない', () => {
    expect(svelte).not.toContain('--row-tint-bg');
  });
});
