import { describe, expect, it } from 'vitest';

import {
  TREE_STATES_MAX,
  emptyTreeMessage,
  fileLabel,
  forgetTreeState,
  hasRestoredView,
  parseTreeStates,
  pickTreeState,
  rememberTreeState,
  restoreExpanded,
  serializeTreeStates,
  type TreeViewState,
} from './treeState';

const state = (root: string, expanded: string[] = [], active: string | null = null): TreeViewState => ({
  root,
  expanded,
  active,
});

describe('parseTreeStates', () => {
  it('未保存は空', () => {
    expect(parseTreeStates(null)).toEqual([]);
    expect(parseTreeStates('   ')).toEqual([]);
  });

  it('壊れた値は捨てて起動を止めない', () => {
    expect(parseTreeStates('{')).toEqual([]);
    expect(parseTreeStates('"文字列"')).toEqual([]);
    expect(parseTreeStates('{"root":"C:\\\\a"}')).toEqual([]);
  });

  it('保存した内容を復元する', () => {
    const raw = JSON.stringify([state('C:\\a', ['docs'], 'docs/a.md')]);
    expect(parseTreeStates(raw)).toEqual([state('C:\\a', ['docs'], 'docs/a.md')]);
  });

  it('root を持たない要素は捨てる', () => {
    const raw = JSON.stringify([{ expanded: ['docs'] }, state('C:\\a')]);
    expect(parseTreeStates(raw)).toEqual([state('C:\\a')]);
  });

  it('expanded の文字列以外と active の型違いは落とす', () => {
    const raw = JSON.stringify([{ root: 'C:\\a', expanded: ['docs', 3, null], active: 7 }]);
    expect(parseTreeStates(raw)).toEqual([state('C:\\a', ['docs'], null)]);
  });

  it('同じ root は先に出てきたものを残す', () => {
    const raw = JSON.stringify([state('C:\\a', ['x']), state('C:\\a', ['y'])]);
    expect(parseTreeStates(raw)).toEqual([state('C:\\a', ['x'])]);
  });

  it('上限を超える分は落とす', () => {
    const many = Array.from({ length: TREE_STATES_MAX + 5 }, (_, i) => state(`C:\\${i}`));
    expect(parseTreeStates(JSON.stringify(many))).toHaveLength(TREE_STATES_MAX);
  });
});

describe('serializeTreeStates', () => {
  it('保存して読み直すと同じ内容になる', () => {
    const states = [state('C:\\a', ['docs'], 'docs/a.md'), state('C:\\b')];
    expect(parseTreeStates(serializeTreeStates(states))).toEqual(states);
  });
});

describe('rememberTreeState', () => {
  it('最後に開いた root を先頭へ置く', () => {
    const states = [state('C:\\a'), state('C:\\b')];
    expect(rememberTreeState(states, state('C:\\b', ['docs'])).map((s) => s.root)).toEqual([
      'C:\\b',
      'C:\\a',
    ]);
  });

  it('同じ root は新しい内容で置き換える', () => {
    const states = [state('C:\\a', ['old'])];
    expect(rememberTreeState(states, state('C:\\a', ['new']))).toEqual([state('C:\\a', ['new'])]);
  });

  it('上限を超えたら使っていない root から落とす', () => {
    const states = Array.from({ length: TREE_STATES_MAX }, (_, i) => state(`C:\\${i}`));
    const next = rememberTreeState(states, state('C:\\new'));
    expect(next).toHaveLength(TREE_STATES_MAX);
    expect(next[0].root).toBe('C:\\new');
    expect(next.map((s) => s.root)).not.toContain(`C:\\${TREE_STATES_MAX - 1}`);
  });
});

describe('forgetTreeState', () => {
  it('指定した root だけ取り除く', () => {
    const states = [state('C:\\a'), state('C:\\b')];
    expect(forgetTreeState(states, 'C:\\a')).toEqual([state('C:\\b')]);
  });

  it('無い root を指定しても変わらない', () => {
    const states = [state('C:\\a')];
    expect(forgetTreeState(states, 'C:\\z')).toEqual(states);
  });
});

describe('pickTreeState', () => {
  it('root で引ける', () => {
    const states = [state('C:\\a', ['docs'])];
    expect(pickTreeState(states, 'C:\\a')).toEqual(state('C:\\a', ['docs']));
  });

  it('記憶が無ければ null', () => {
    expect(pickTreeState([], 'C:\\a')).toBeNull();
  });
});

describe('restoreExpanded', () => {
  const folders = ['docs', 'docs/specs'];

  it('記憶が無ければ既定の展開に従う', () => {
    expect(restoreExpanded(null, folders, ['docs'])).toEqual(['docs']);
  });

  it('記憶したフォルダを開き直す', () => {
    expect(restoreExpanded(['docs', 'docs/specs'], folders, ['docs'])).toEqual([
      'docs',
      'docs/specs',
    ]);
  });

  it('もう無いフォルダは落とす', () => {
    expect(restoreExpanded(['docs', '消えた'], folders, ['docs'])).toEqual(['docs']);
  });

  // 全部畳んだ状態も操作の結果なので、既定へ戻さずそのまま再現する。
  it('全部畳んだ記憶は畳んだまま', () => {
    expect(restoreExpanded([], folders, ['docs'])).toEqual([]);
  });
});

describe('hasRestoredView', () => {
  it('記憶が無ければ知らせない', () => {
    expect(hasRestoredView(null, ['docs'], 'docs/a.md')).toBe(false);
  });

  it('ファイルを開き直したら知らせる', () => {
    expect(hasRestoredView(state('C:\\a'), [], 'docs/a.md')).toBe(true);
  });

  it('展開だけ戻したときも知らせる', () => {
    expect(hasRestoredView(state('C:\\a'), ['docs'], null)).toBe(true);
  });

  // 記憶が残っていても、対象が消えて何も戻らなかったなら「再開しました」は嘘になる。
  it('何も戻らなかったら知らせない', () => {
    expect(hasRestoredView(state('C:\\a'), [], null)).toBe(false);
  });
});

describe('fileLabel', () => {
  it('末尾のファイル名だけを返す', () => {
    expect(fileLabel('docs/specs/検証シート.md')).toBe('検証シート.md');
  });

  it('直下のファイルはそのまま', () => {
    expect(fileLabel('README.md')).toBe('README.md');
  });

  it('空なら空', () => {
    expect(fileLabel('')).toBe('');
  });
});

describe('emptyTreeMessage', () => {
  it('絞り込みが最優先（絞った結果 0 件は「無い」ではない）', () => {
    expect(emptyTreeMessage(true, false)).toBe('tree.filterNoMatch');
    expect(emptyTreeMessage(true, true)).toBe('tree.filterNoMatch');
  });

  it('業務文書だけのフォルダは扱える種類を挙げる', () => {
    expect(emptyTreeMessage(false, false)).toBe('tree.noFiles');
  });

  // web を名乗るフォルダでは HTML / CSS も並ぶ。`.md / .tsv` だけを挙げると
  // 「置いたのに出ない」と読めてしまう。
  it('web を名乗るフォルダは別の言い方にする', () => {
    expect(emptyTreeMessage(false, true)).toBe('tree.noFilesWeb');
  });
});
