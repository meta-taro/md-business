import { describe, expect, it } from 'vitest';
import { clampView, type GridView } from './gridView';

const view = (over: Partial<GridView> = {}): GridView => ({
  anchorRow: 0,
  anchorCol: 0,
  focusRow: 0,
  focusCol: 0,
  scrollTop: 0,
  ...over,
});

describe('clampView', () => {
  it('行も列もあるならそのまま返す', () => {
    const v = view({ anchorRow: 2, anchorCol: 1, focusRow: 4, focusCol: 3, scrollTop: 120 });
    expect(clampView(v, 10, 6)).toEqual(v);
  });

  it('行が減っていたら最終行へ寄せる', () => {
    const v = view({ anchorRow: 8, focusRow: 9 });
    expect(clampView(v, 3, 6)).toMatchObject({ anchorRow: 2, focusRow: 2 });
  });

  it('列が減っていたら最終列へ寄せる', () => {
    const v = view({ anchorCol: 5, focusCol: 7 });
    expect(clampView(v, 10, 2)).toMatchObject({ anchorCol: 1, focusCol: 1 });
  });

  it('負の位置は先頭へ戻す', () => {
    const v = view({ anchorRow: -3, focusCol: -1, scrollTop: -40 });
    expect(clampView(v, 10, 6)).toMatchObject({ anchorRow: 0, focusCol: 0, scrollTop: 0 });
  });

  it('行が 1 つも無いなら復元しない', () => {
    expect(clampView(view(), 0, 6)).toBeNull();
  });

  it('列が 1 つも無いなら復元しない', () => {
    expect(clampView(view(), 10, 0)).toBeNull();
  });

  it('覚えていないなら復元しない', () => {
    expect(clampView(null, 10, 6)).toBeNull();
  });
});
