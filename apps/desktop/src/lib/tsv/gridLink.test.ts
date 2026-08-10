import { describe, expect, it } from 'vitest';
import { followableLink } from './gridLink';

describe('followableLink', () => {
  it('url 列の値だけをリンクとして扱う', () => {
    expect(followableLink('url', 'https://example.com', true)).toEqual({
      kind: 'external',
      href: 'https://example.com',
    });
  });

  it('同じシートの中の行は指せる', () => {
    expect(followableLink('url', '#項目=TC-012', true)).toEqual({
      kind: 'row',
      path: null,
      column: '項目',
      value: 'TC-012',
    });
  });

  // 表の外へ出る指し先は、受け取り手（親）がいないと開けない。
  // 受け取り手がいなくても、表の中で完結する移動は効く。
  it('画面の外へ出る指し先は、受け取り手がいなければリンクにしない', () => {
    expect(followableLink('url', 'https://example.com', false)).toBeNull();
    expect(followableLink('url', '#項目=TC-012', false)).toEqual({
      kind: 'row',
      path: null,
      column: '項目',
      value: 'TC-012',
    });
  });

  // 自由文のセルを走査してリンクにすると、1 セル確定するたびに行数ぶん働くことになる。
  // 列で宣言してもらえば走査は要らず、値がたまたまリンクに見えて誤爆することもない。
  it('自由文の列はリンクにしない', () => {
    expect(followableLink('text', 'https://example.com', true)).toBeNull();
    expect(followableLink('multiline', 'https://example.com', true)).toBeNull();
    expect(followableLink(undefined, 'https://example.com', true)).toBeNull();
  });

  it('空のセルはリンクにしない', () => {
    expect(followableLink('url', '', true)).toBeNull();
    expect(followableLink('url', '   ', true)).toBeNull();
  });

  it('開けないものはリンクにしない', () => {
    expect(followableLink('url', 'javascript:alert(1)', true)).toBeNull();
    expect(followableLink('url', '参照メモ', true)).toBeNull();
  });

  it('別のファイルの行も指せる', () => {
    expect(followableLink('url', '../002-signup.tsv#項目=TC-012', true)).toEqual({
      kind: 'row',
      path: '../002-signup.tsv',
      column: '項目',
      value: 'TC-012',
    });
    expect(followableLink('url', 'docs/specs/order.md', true)).toEqual({
      kind: 'file',
      path: 'docs/specs/order.md',
    });
  });

  // まだ移動を実装していない指し先は、クリックできる見た目にしない。
  // 押しても何も起きないリンクは、壊れているのと見分けがつかない。
  it('まだ移動できない指し先はリンクにしない', () => {
    expect(followableLink('url', 'docs/specs/order.md#受注の登録', true)).toBeNull();
  });
});
