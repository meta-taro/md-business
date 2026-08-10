import { describe, expect, it } from 'vitest';
import { followableLink } from './gridLink';

describe('followableLink', () => {
  it('url 列の値だけをリンクとして扱う', () => {
    expect(followableLink('url', 'https://example.com')).toEqual({
      kind: 'external',
      href: 'https://example.com',
    });
  });

  // 自由文のセルを走査してリンクにすると、1 セル確定するたびに行数ぶん働くことになる。
  // 列で宣言してもらえば走査は要らず、値がたまたまリンクに見えて誤爆することもない。
  it('自由文の列はリンクにしない', () => {
    expect(followableLink('text', 'https://example.com')).toBeNull();
    expect(followableLink('multiline', 'https://example.com')).toBeNull();
    expect(followableLink(undefined, 'https://example.com')).toBeNull();
  });

  it('空のセルはリンクにしない', () => {
    expect(followableLink('url', '')).toBeNull();
    expect(followableLink('url', '   ')).toBeNull();
  });

  it('開けないものはリンクにしない', () => {
    expect(followableLink('url', 'javascript:alert(1)')).toBeNull();
    expect(followableLink('url', '参照メモ')).toBeNull();
  });

  // まだ移動を実装していない指し先は、クリックできる見た目にしない。
  // 押しても何も起きないリンクは、壊れているのと見分けがつかない。
  it('まだ移動できない指し先はリンクにしない', () => {
    expect(followableLink('url', '#項目=TC-012')).toBeNull();
    expect(followableLink('url', 'docs/test-specs/001-login.tsv#項目=TC-012')).toBeNull();
    expect(followableLink('url', 'docs/specs/order.md#受注の登録')).toBeNull();
    expect(followableLink('url', 'docs/specs/order.md')).toBeNull();
  });
});
