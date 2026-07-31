import { describe, it, expect } from 'vitest';
import { buildGitArgs, createGitRunner } from './gitRunner.js';

describe('buildGitArgs', () => {
  it('root を -C で渡し、任意ロックを作らせない', () => {
    expect(buildGitArgs('C:/work/docs', ['status'])).toEqual([
      '-C',
      'C:/work/docs',
      '--no-optional-locks',
      'status',
    ]);
  });
});

describe('createGitRunner', () => {
  it('実行のたびに現在の root を読み直す（フォルダ切り替えに追従する）', async () => {
    const seen: string[][] = [];
    let root = '/first';
    const runner = createGitRunner(
      () => root,
      async (args) => {
        seen.push(args);
        return { ok: true, stdout: '', stderr: '' };
      },
    );

    await runner.run(['status']);
    root = '/second';
    await runner.run(['status']);

    expect(seen[0]?.[1]).toBe('/first');
    expect(seen[1]?.[1]).toBe('/second');
  });
});
