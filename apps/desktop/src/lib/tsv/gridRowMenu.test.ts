import { describe, expect, it } from 'vitest';
import { rowMenuItems, rowMenuSelection } from './gridRowMenu';

describe('rowMenuSelection', () => {
  it('右クリックした行を丸ごと選び直す', () => {
    expect(rowMenuSelection(5, 4)).toEqual({
      anchor: { row: 5, col: 0 },
      focus: { row: 5, col: 3 },
    });
  });

  it('列が 0 でも範囲を作れる', () => {
    expect(rowMenuSelection(2, 0)).toEqual({
      anchor: { row: 2, col: 0 },
      focus: { row: 2, col: 0 },
    });
  });
});

describe('rowMenuItems', () => {
  it('行操作バーと同じラベルを使う', () => {
    // 右クリックとバーで名前が違うと、同じ操作が 2 つあるように見える。
    expect(rowMenuItems(false).map((item) => item.labelKey)).toEqual([
      'grid.duplicateRow',
      'grid.copyRow',
      'grid.clearRow',
      'grid.hideRow',
      'grid.deleteRow',
    ]);
  });

  it('控えている行では戻す側のラベルになる', () => {
    expect(rowMenuItems(true).map((item) => item.labelKey)).toContain('grid.unhideRow');
  });

  it('削除だけを危険として印す', () => {
    expect(
      rowMenuItems(false)
        .filter((item) => item.danger)
        .map((item) => item.action),
    ).toEqual(['delete']);
  });
});
