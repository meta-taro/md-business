import { describe, it, expect } from 'vitest';
import {
  MAX_TABS,
  evictionTarget,
  findByPath,
  keepExistingTabs,
  moveTab,
  nextActiveId,
  survivingActiveId,
  withoutTab,
  type TabRef,
} from './tabs';

const tabs = (...specs: string[]): TabRef[] =>
  specs.map((spec, i) => {
    const [id, touch] = spec.split('@');
    return { id, relPath: `${id}.md`, touchSeq: touch === undefined ? i : Number(touch) };
  });

const ids = (list: readonly TabRef[]): string[] => list.map((t) => t.id);

describe('findByPath', () => {
  it('同じファイルが開いていればそのタブを返す', () => {
    expect(findByPath(tabs('a', 'b'), 'b.md')?.id).toBe('b');
  });

  it('開いていなければ null', () => {
    expect(findByPath(tabs('a'), 'z.md')).toBeNull();
  });
});

describe('evictionTarget', () => {
  it('上限に達していなければ何も閉じない', () => {
    expect(evictionTarget(tabs('a', 'b'), 3, 'b')).toBeNull();
  });

  it('上限に達したら、最後に触ってから一番経ったタブを閉じる', () => {
    expect(evictionTarget(tabs('a@5', 'b@1', 'c@9'), 3, 'c')).toBe('b');
  });

  it('選択中のタブは閉じない（次に古いものを閉じる）', () => {
    expect(evictionTarget(tabs('a@1', 'b@2', 'c@3'), 3, 'a')).toBe('b');
  });

  it('選択中の 1 枚だけなら閉じるものが無い', () => {
    expect(evictionTarget(tabs('a@1'), 1, 'a')).toBeNull();
  });
});

describe('nextActiveId', () => {
  it('選択中でないタブを閉じても、選択は動かない', () => {
    expect(nextActiveId(tabs('a', 'b', 'c'), 'a', 'b')).toBe('b');
  });

  it('選択中を閉じたら右隣を選ぶ', () => {
    expect(nextActiveId(tabs('a', 'b', 'c'), 'b', 'b')).toBe('c');
  });

  it('右端を閉じたら左隣を選ぶ', () => {
    expect(nextActiveId(tabs('a', 'b'), 'b', 'b')).toBe('a');
  });

  it('最後の 1 枚を閉じたら何も開いていない状態に戻る', () => {
    expect(nextActiveId(tabs('a'), 'a', 'a')).toBeNull();
  });

  it('開いていないタブを指されても選択を壊さない', () => {
    expect(nextActiveId(tabs('a', 'b'), 'z', 'b')).toBe('b');
  });
});

describe('withoutTab', () => {
  it('指したタブだけを外し、並びは変えない', () => {
    expect(ids(withoutTab(tabs('a', 'b', 'c'), 'b'))).toEqual(['a', 'c']);
  });

  it('入力は変えない', () => {
    const before = tabs('a', 'b');
    withoutTab(before, 'a');
    expect(ids(before)).toEqual(['a', 'b']);
  });
});

describe('MAX_TABS', () => {
  it('帯に並べられる枚数を上限とする', () => {
    expect(MAX_TABS).toBe(12);
  });
});

describe('keepExistingTabs', () => {
  it('走査結果に無いファイルのタブを落とす', () => {
    const kept = keepExistingTabs(tabs('a', 'b', 'c'), new Set(['a.md', 'c.md']));
    expect(kept.map((t) => t.id)).toEqual(['a', 'c']);
  });

  it('全部残るときは並びも変わらない', () => {
    const before = tabs('a', 'b');
    expect(keepExistingTabs(before, new Set(['a.md', 'b.md']))).toEqual(before);
  });

  it('1 つも残らなければ空になる', () => {
    expect(keepExistingTabs(tabs('a'), new Set())).toEqual([]);
  });
});

describe('survivingActiveId', () => {
  it('手前のタブが残っていればそのまま', () => {
    expect(survivingActiveId(tabs('a', 'b'), 'b')).toBe('b');
  });

  it('手前のタブが消えたら最後のタブへ移る', () => {
    expect(survivingActiveId(tabs('a', 'b'), 'c')).toBe('b');
  });

  it('1 つも残っていなければ何も開いていない状態へ戻す', () => {
    expect(survivingActiveId([], 'a')).toBeNull();
  });

  it('もともと何も開いていなければ null のまま', () => {
    expect(survivingActiveId(tabs('a'), null)).toBeNull();
  });
});

describe('moveTab', () => {
  it('後ろへ動かす（落とした先の手前に入る）', () => {
    expect(ids(moveTab(tabs('a', 'b', 'c'), 'a', 2))).toEqual(['b', 'a', 'c']);
  });

  it('前へ動かす', () => {
    expect(ids(moveTab(tabs('a', 'b', 'c'), 'c', 0))).toEqual(['c', 'a', 'b']);
  });

  it('末尾へ動かす', () => {
    expect(ids(moveTab(tabs('a', 'b', 'c'), 'a', 3))).toEqual(['b', 'c', 'a']);
  });

  it('同じ位置へ落としても並びは変わらない', () => {
    expect(ids(moveTab(tabs('a', 'b', 'c'), 'b', 1))).toEqual(['a', 'b', 'c']);
    expect(ids(moveTab(tabs('a', 'b', 'c'), 'b', 2))).toEqual(['a', 'b', 'c']);
  });

  it('範囲の外は端に丸める', () => {
    expect(ids(moveTab(tabs('a', 'b', 'c'), 'b', -5))).toEqual(['b', 'a', 'c']);
    expect(ids(moveTab(tabs('a', 'b', 'c'), 'b', 99))).toEqual(['a', 'c', 'b']);
  });

  it('無い id は並びを変えない', () => {
    expect(ids(moveTab(tabs('a', 'b'), 'z', 0))).toEqual(['a', 'b']);
  });

  it('元の配列は変えない', () => {
    const before = tabs('a', 'b', 'c');
    moveTab(before, 'a', 3);
    expect(ids(before)).toEqual(['a', 'b', 'c']);
  });
});
