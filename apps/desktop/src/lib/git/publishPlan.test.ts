/**
 * 「出す」を押す前の下見を組み立てる純ロジック。
 *
 * Rust は git が持っている事実だけを返す。出せるか・何を止めるかはここで決める。
 * 断る理由の文言をここに書かないのは、画面の言葉が 4 つあるため（呼び出し側で引く）。
 */
import { describe, it, expect } from 'vitest';
import { planPublish, type PublishSurvey } from './publishPlan';
import { emptyGitStatus, type GitFileStatus } from './gitStatus';

function survey(
  over: Partial<PublishSurvey> = {},
  files: GitFileStatus[] = []
): PublishSurvey {
  return {
    status: { ...emptyGitStatus(), isRepo: true, branch: 'main', files },
    remote: 'https://github.com/o/r.git',
    hasUpstream: true,
    pending: [],
    runsUrl: 'https://github.com/o/r/actions?query=branch%3Amain',
    ...over,
  };
}

describe('planPublish', () => {
  it('変更があれば出せる', () => {
    const plan = planPublish(
      survey({}, [
        { relPath: 'index.md', state: 'modified' },
        { relPath: 'assets/a.png', state: 'untracked' },
      ])
    );
    expect(plan).toEqual({
      kind: 'ready',
      branch: 'main',
      remote: 'https://github.com/o/r.git',
      paths: ['index.md', 'assets/a.png'],
      pending: [],
      hasUpstream: true,
      runsUrl: 'https://github.com/o/r/actions?query=branch%3Amain',
    });
  });

  // 手元で commit だけ済ませてあることがある。変更が無くても、出していない分があれば出す。
  it('変更が無くても出していない分があれば出せる', () => {
    const plan = planPublish(survey({ pending: ['見出し'] }));
    expect(plan.kind).toBe('ready');
    if (plan.kind === 'ready') {
      expect(plan.paths).toEqual([]);
      expect(plan.pending).toEqual(['見出し']);
    }
  });

  // 送り先がまだ決まっていないブランチ。出す先は決まるので止めない。
  it('送り先が未設定でも出せる', () => {
    const plan = planPublish(
      survey({ hasUpstream: false }, [
        { relPath: 'index.md', state: 'modified' },
      ])
    );
    expect(plan.kind).toBe('ready');
    if (plan.kind === 'ready') expect(plan.hasUpstream).toBe(false);
  });

  it('出すものが無ければ押させない', () => {
    expect(planPublish(survey())).toEqual({ kind: 'nothing' });
  });

  it('git の管理下でなければ出せない', () => {
    expect(planPublish(survey({ status: emptyGitStatus() }))).toEqual({
      kind: 'no-repo',
    });
  });

  // 置き先が無いフォルダ。commit までは出来るが、出した先が無い。
  it('置き先が無ければ出せない', () => {
    expect(
      planPublish(
        survey({ remote: null }, [{ relPath: 'a.md', state: 'modified' }])
      )
    ).toEqual({
      kind: 'no-remote',
    });
  });

  // どのブランチにも乗っていない状態。出しても誰も追えない場所に積む。
  it('ブランチから外れていたら出せない', () => {
    const status = { ...emptyGitStatus(), isRepo: true, branch: null };
    expect(planPublish(survey({ status }))).toEqual({ kind: 'detached' });
  });

  // 突き合わせの途中。そのまま commit すると目印の行ごと出る。
  it('突き合わせが終わっていなければ出せない', () => {
    const plan = planPublish(
      survey({}, [
        { relPath: 'a.md', state: 'conflicted' },
        { relPath: 'b.md', state: 'modified' },
      ])
    );
    expect(plan).toEqual({ kind: 'conflicted', paths: ['a.md'] });
  });

  // 置き先の方が進んでいる。押しても置き先に断られるので、先に取り込む。
  it('置き先が進んでいたら出せない', () => {
    const status = {
      ...emptyGitStatus(),
      isRepo: true,
      branch: 'main',
      behind: 2,
    };
    expect(planPublish(survey({ status, pending: ['x'] }))).toEqual({
      kind: 'behind',
      behind: 2,
    });
  });
});
