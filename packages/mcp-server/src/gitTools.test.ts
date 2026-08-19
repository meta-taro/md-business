import { describe, it, expect } from 'vitest';
import {
  parseStatusPorcelainV2,
  gitStatus,
  gitDiff,
  gitCommit,
  type GitRunResult,
  type GitRunner,
} from './gitTools.js';

/** 呼ばれた引数を記録し、あらかじめ用意した結果を順に返すフェイク。 */
class FakeGit implements GitRunner {
  readonly calls: string[][] = [];
  private readonly results: GitRunResult[];

  constructor(results: GitRunResult[]) {
    this.results = [...results];
  }

  async run(args: string[]): Promise<GitRunResult> {
    this.calls.push(args);
    return this.results.shift() ?? { ok: true, stdout: '', stderr: '' };
  }
}

function ok(stdout: string): GitRunResult {
  return { ok: true, stdout, stderr: '' };
}

function fail(stderr: string): GitRunResult {
  return { ok: false, stdout: '', stderr };
}

/** porcelain v2 の -z 出力を組み立てる（レコードは NUL 終端）。 */
function nul(...records: string[]): string {
  return records.map((r) => `${r}\0`).join('');
}

describe('parseStatusPorcelainV2', () => {
  it('ブランチと ahead / behind を読む', () => {
    const s = parseStatusPorcelainV2(nul('# branch.head feat/x', '# branch.ab +2 -3'));
    expect(s.branch).toBe('feat/x');
    expect(s.ahead).toBe(2);
    expect(s.behind).toBe(3);
  });

  it('detached HEAD はブランチ null', () => {
    const s = parseStatusPorcelainV2(nul('# branch.head (detached)'));
    expect(s.branch).toBeNull();
  });

  it('変更・追加・削除・未追跡を状態つきで集める', () => {
    const s = parseStatusPorcelainV2(
      nul(
        '1 .M N... 100644 100644 100644 aaa bbb docs/a b.md',
        '1 A. N... 000000 100644 100644 000 ccc docs/new.md',
        '1 .D N... 100644 100644 000000 ddd eee docs/gone.md',
        '? docs/untracked.md',
      ),
    );
    expect(s.files).toEqual([
      { path: 'docs/a b.md', state: 'modified' },
      { path: 'docs/new.md', state: 'added' },
      { path: 'docs/gone.md', state: 'deleted' },
      { path: 'docs/untracked.md', state: 'untracked' },
    ]);
  });

  it('リネームは origPath フィールドを読み飛ばす', () => {
    const s = parseStatusPorcelainV2(
      nul(
        '2 R. N... 100644 100644 100644 aaa bbb R100 docs/new.md',
        'docs/old.md',
        '? docs/other.md',
      ),
    );
    expect(s.files).toEqual([
      { path: 'docs/new.md', state: 'renamed' },
      { path: 'docs/other.md', state: 'untracked' },
    ]);
  });

  it('未マージは conflicted、無視ファイルは出さない', () => {
    const s = parseStatusPorcelainV2(
      nul('u UU N... 100644 100644 100644 100644 a b c docs/conflict.md', '! build/out.js'),
    );
    expect(s.files).toEqual([{ path: 'docs/conflict.md', state: 'conflicted' }]);
  });
});

describe('gitStatus', () => {
  it('status を 1 回だけ叩いて結果を返す', async () => {
    const git = new FakeGit([ok(nul('# branch.head main', '? memo.md'))]);
    const r = await gitStatus(git);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.branch).toBe('main');
    expect(r.files).toEqual([{ path: 'memo.md', state: 'untracked' }]);
    expect(git.calls).toEqual([['status', '--porcelain=v2', '--branch', '-z']]);
  });

  it('git リポジトリでなければ理由つきで失敗する', async () => {
    const git = new FakeGit([fail('fatal: not a git repository')]);
    const r = await gitStatus(git);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain('not a git repository');
  });
});

describe('gitDiff', () => {
  it('パスを指定すると HEAD との差分を返す', async () => {
    const git = new FakeGit([ok('diff --git a/docs/a.md b/docs/a.md\n+追加\n')]);
    const r = await gitDiff(git, 'docs/a.md');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.diff).toContain('+追加');
    expect(r.untracked).toBe(false);
    expect(git.calls).toEqual([['diff', 'HEAD', '--', 'docs/a.md']]);
  });

  it('HEAD が無いリポジトリでは HEAD 無しの差分へ退避する', async () => {
    const git = new FakeGit([fail("fatal: bad revision 'HEAD'"), ok('+新規\n')]);
    const r = await gitDiff(git, 'docs/a.md');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.diff).toContain('+新規');
    expect(git.calls[1]).toEqual(['diff', '--', 'docs/a.md']);
  });

  it('差分が空なら追跡の有無を確かめ、未追跡だと明示する', async () => {
    const git = new FakeGit([ok(''), ok(''), fail('did not match any file(s) known to git')]);
    const r = await gitDiff(git, 'memo.md');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.diff).toBe('');
    expect(r.untracked).toBe(true);
  });

  it('追跡済みで差分が無ければ untracked にはしない', async () => {
    const git = new FakeGit([ok(''), ok(''), ok('docs/a.md\n')]);
    const r = await gitDiff(git, 'docs/a.md');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.diff).toBe('');
    expect(r.untracked).toBe(false);
  });

  it('パス省略でワークスペース全体の差分を返す', async () => {
    const git = new FakeGit([ok('diff --git a/x b/x\n')]);
    const r = await gitDiff(git);
    expect(r.ok).toBe(true);
    expect(git.calls).toEqual([['diff', 'HEAD']]);
  });

  it('ワークスペース外のパスは git を呼ばずに拒否する', async () => {
    const git = new FakeGit([]);
    const r = await gitDiff(git, '../secret.md');
    expect(r.ok).toBe(false);
    expect(git.calls).toEqual([]);
  });
});

describe('gitCommit', () => {
  it('全変更をステージしてコミットし、ハッシュと最新 status を返す', async () => {
    const git = new FakeGit([
      ok(''), // add -A
      ok('[main abc1234] 変更\n'), // commit
      ok('abc1234def\n'), // rev-parse
      ok(nul('# branch.head main')), // status
    ]);
    const r = await gitCommit(git, { message: '変更' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.commit).toBe('abc1234def');
    expect(r.branch).toBe('main');
    expect(r.files).toEqual([]);
    expect(git.calls[0]).toEqual(['add', '-A']);
    expect(git.calls[1]).toEqual(['commit', '-m', '変更']);
  });

  it('パスを指定するとその分だけステージする', async () => {
    const git = new FakeGit([ok(''), ok(''), ok('h\n'), ok(nul('# branch.head main'))]);
    const r = await gitCommit(git, { message: '一部だけ', paths: ['docs/a.md', 'docs/b.md'] });
    expect(r.ok).toBe(true);
    expect(git.calls[0]).toEqual(['add', '--', 'docs/a.md', 'docs/b.md']);
  });

  // ステージするだけだと、利用者が別に `git add` 済みの変更が同じコミットへ紛れ込む。
  // 混ざったことは後から履歴でしか分からないので、commit 側にも同じパスを渡す。
  it('パスを指定したコミットは先にステージ済みの別変更を巻き込まない', async () => {
    const git = new FakeGit([ok(''), ok(''), ok('h\n'), ok(nul('# branch.head main'))]);
    await gitCommit(git, { message: '一部だけ', paths: ['docs/a.md'] });
    expect(git.calls[1]).toEqual(['commit', '-m', '一部だけ', '--', 'docs/a.md']);
  });

  it('空メッセージは git を呼ばずに断る', async () => {
    const git = new FakeGit([]);
    const r = await gitCommit(git, { message: '   ' });
    expect(r.ok).toBe(false);
    expect(git.calls).toEqual([]);
  });

  it('ワークスペース外のパスは git を呼ばずに拒否する', async () => {
    const git = new FakeGit([]);
    const r = await gitCommit(git, { message: 'x', paths: ['../outside.md'] });
    expect(r.ok).toBe(false);
    expect(git.calls).toEqual([]);
  });

  it('コミットするものが無ければ git の理由をそのまま返す', async () => {
    const git = new FakeGit([ok(''), fail('nothing to commit, working tree clean')]);
    const r = await gitCommit(git, { message: '空コミット' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain('nothing to commit');
  });

  // メッセージは `-m` の次の位置引数として渡すので、先頭が `-` でもオプションにならない。
  it('先頭が - のメッセージもそのまま渡す', async () => {
    const git = new FakeGit([ok(''), ok(''), ok('h\n'), ok(nul('# branch.head main'))]);
    await gitCommit(git, { message: '--amend っぽい文字列' });
    expect(git.calls[1]).toEqual(['commit', '-m', '--amend っぽい文字列']);
  });
});
