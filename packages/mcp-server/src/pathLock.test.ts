import { describe, it, expect } from 'vitest';
import { withPathLock, pendingPathLockCount } from './pathLock.js';

/** 指定ミリ秒待つ（実行順の入れ替わりを作るため）。 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('withPathLock', () => {
  it('同じパスへの処理は開始順に直列化される', async () => {
    const log: string[] = [];
    const task = (name: string, ms: number) => async () => {
      log.push(`${name}:start`);
      await sleep(ms);
      log.push(`${name}:end`);
      return name;
    };

    // 先に始めたほうが遅い。直列化されていなければ b が a を追い越す。
    const a = withPathLock('x.tsv', task('a', 20));
    const b = withPathLock('x.tsv', task('b', 0));
    expect(await Promise.all([a, b])).toEqual(['a', 'b']);
    expect(log).toEqual(['a:start', 'a:end', 'b:start', 'b:end']);
  });

  it('別のパスは互いに待たない', async () => {
    const log: string[] = [];
    const a = withPathLock('a.tsv', async () => {
      log.push('a:start');
      await sleep(20);
      log.push('a:end');
    });
    const b = withPathLock('b.tsv', async () => {
      log.push('b:start');
    });
    await Promise.all([a, b]);
    // b は a の完了を待たずに走る
    expect(log).toEqual(['a:start', 'b:start', 'a:end']);
  });

  it('前の処理が失敗しても後続は実行される', async () => {
    const failed = withPathLock('x.tsv', async () => {
      throw new Error('boom');
    });
    await expect(failed).rejects.toThrow('boom');
    await expect(withPathLock('x.tsv', async () => 'ok')).resolves.toBe('ok');
  });

  it('待ちが無くなったパスの錠前は残さない', async () => {
    await Promise.all([
      withPathLock('x.tsv', async () => sleep(1)),
      withPathLock('x.tsv', async () => sleep(1)),
      withPathLock('y.tsv', async () => sleep(1)),
    ]);
    // マイクロタスク 1 巡ぶん待ってから確認する（解放は then で行う）
    await sleep(0);
    expect(pendingPathLockCount()).toBe(0);
  });
});
