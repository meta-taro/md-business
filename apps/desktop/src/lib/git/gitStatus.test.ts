import { describe, it, expect } from 'vitest';
import {
  emptyGitStatus,
  buildStatusMap,
  lookupState,
  changeCount,
  gitMarkLetter,
  forgeLabel,
  toTreeRelPath,
  commitTargets,
  type GitStatus,
} from './gitStatus';

/** Rust git_status の戻りを模した最小 GitStatus を組む。 */
function status(partial: Partial<GitStatus>): GitStatus {
  return { ...emptyGitStatus(), isRepo: true, ...partial };
}

describe('emptyGitStatus — 非リポジトリ既定', () => {
  it('isRepo=false で全フィールドが空', () => {
    const s = emptyGitStatus();
    expect(s.isRepo).toBe(false);
    expect(s.branch).toBeNull();
    expect(s.ahead).toBe(0);
    expect(s.behind).toBe(0);
    expect(s.files).toEqual([]);
    expect(s.forge).toBeNull();
    expect(s.prefix).toBe('');
  });
});

describe('buildStatusMap / lookupState — repo root 基準パスの突き合わせ', () => {
  it('relPath → state の Map を作る', () => {
    const s = status({
      files: [
        { relPath: 'a.md', state: 'modified' },
        { relPath: 'docs/b.md', state: 'untracked' },
      ],
    });
    const map = buildStatusMap(s);
    expect(map.get('a.md')).toBe('modified');
    expect(map.get('docs/b.md')).toBe('untracked');
    expect(map.size).toBe(2);
  });

  it('prefix を足して「開いたフォルダ基準の relPath」を照合する', () => {
    // リポジトリ root で apps/desktop を開いた想定: git パスは apps/desktop/README.md、
    // ツリー行の relPath は README.md。prefix=apps/desktop/ を足して一致させる。
    const s = status({
      prefix: 'apps/desktop/',
      files: [{ relPath: 'apps/desktop/README.md', state: 'modified' }],
    });
    const map = buildStatusMap(s);
    expect(lookupState(map, s.prefix, 'README.md')).toBe('modified');
    expect(lookupState(map, s.prefix, 'other.md')).toBeNull();
  });

  it('prefix 空（repo root を開いた）ならそのまま照合', () => {
    const s = status({ prefix: '', files: [{ relPath: 'a.md', state: 'added' }] });
    const map = buildStatusMap(s);
    expect(lookupState(map, s.prefix, 'a.md')).toBe('added');
  });
});

describe('changeCount — 変更ファイル数', () => {
  it('files の長さを返す', () => {
    expect(changeCount(status({ files: [] }))).toBe(0);
    expect(
      changeCount(
        status({
          files: [
            { relPath: 'a.md', state: 'modified' },
            { relPath: 'b.md', state: 'untracked' },
          ],
        }),
      ),
    ).toBe(2);
  });
});

describe('gitMarkLetter — VSCode 風の 1 文字バッジ', () => {
  it('各状態を頭文字へ写像する', () => {
    expect(gitMarkLetter('modified')).toBe('M');
    expect(gitMarkLetter('added')).toBe('A');
    expect(gitMarkLetter('untracked')).toBe('U');
    expect(gitMarkLetter('deleted')).toBe('D');
    expect(gitMarkLetter('renamed')).toBe('R');
    expect(gitMarkLetter('conflicted')).toBe('C');
  });
});

describe('toTreeRelPath — repo root 基準 → 開いたフォルダ基準の逆変換', () => {
  it('prefix 空（repo root を開いた）はそのまま返す', () => {
    expect(toTreeRelPath('', 'a.md')).toBe('a.md');
    expect(toTreeRelPath('', 'docs/b.md')).toBe('docs/b.md');
  });

  it('prefix 配下のパスは prefix を剥がしてツリー相対にする', () => {
    expect(toTreeRelPath('apps/desktop/', 'apps/desktop/README.md')).toBe('README.md');
    expect(toTreeRelPath('apps/desktop/', 'apps/desktop/src/x.ts')).toBe('src/x.ts');
  });

  it('開いたフォルダの外（別サブツリー）の変更は null（エディターで開けない）', () => {
    expect(toTreeRelPath('apps/desktop/', 'packages/core/x.ts')).toBeNull();
    expect(toTreeRelPath('apps/desktop/', 'README.md')).toBeNull();
  });
});

describe('forgeLabel — StatusBar 表示名', () => {
  it('既知フォージは表示名・未知/nullは既定', () => {
    expect(forgeLabel('github')).toBe('GitHub');
    expect(forgeLabel('gitlab')).toBe('GitLab');
    expect(forgeLabel('bitbucket')).toBe('Bitbucket');
    expect(forgeLabel('other')).toBe('Git');
    expect(forgeLabel(null)).toBe('未判定');
  });
});

describe('commitTargets — コミット対象の絞り込み', () => {
  const files = status({
    files: [
      { relPath: 'a.md', state: 'modified' },
      { relPath: 'b.md', state: 'untracked' },
      { relPath: 'c.md', state: 'deleted' },
    ],
  }).files;

  it('除外なしなら paths は undefined（= 全変更をコミット）', () => {
    const r = commitTargets(files, new Set());
    expect(r.paths).toBeUndefined();
    expect(r.count).toBe(3);
  });

  it('除外があるとその分を落とした paths を返す', () => {
    const r = commitTargets(files, new Set(['b.md']));
    expect(r.paths).toEqual(['a.md', 'c.md']);
    expect(r.count).toBe(2);
  });

  it('全部除外すると count=0・paths は空配列（コミットさせない判定に使う）', () => {
    const r = commitTargets(files, new Set(['a.md', 'b.md', 'c.md']));
    expect(r.paths).toEqual([]);
    expect(r.count).toBe(0);
  });

  it('既に無くなったファイルの除外指定は無視する（一覧に残らない）', () => {
    // 除外したまま別の誰かがコミットして一覧から消えた場合。全選択と同じ扱いに戻す。
    const r = commitTargets(files, new Set(['gone.md']));
    expect(r.paths).toBeUndefined();
    expect(r.count).toBe(3);
  });

  it('変更が無ければ count=0', () => {
    const r = commitTargets([], new Set());
    expect(r.count).toBe(0);
  });
});
