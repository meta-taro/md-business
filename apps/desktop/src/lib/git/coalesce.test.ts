import { describe, it, expect } from 'vitest';
import { coalesce } from './coalesce';

/** 手で解決できる約束。実行中に要求が重なる状況を組み立てる。 */
function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

/** 積み残したマイクロタスクを吐き出す。 */
async function flush(): Promise<void> {
  for (let i = 0; i < 8; i++) await Promise.resolve();
}

describe('coalesce', () => {
  it('実行中でなければそのまま呼ぶ', async () => {
    const seen: string[] = [];
    const run = coalesce(async (arg: string) => {
      seen.push(arg);
    });
    await run('a');
    expect(seen).toEqual(['a']);
  });

  it('実行中に重なった要求は 1 回にまとめ、最後の引数で追いかける', async () => {
    const seen: string[] = [];
    const gates = [deferred(), deferred()];
    const run = coalesce(async (arg: string) => {
      seen.push(arg);
      await gates[seen.length - 1]!.promise;
    });

    const first = run('a'); // 走り出して止まる
    void run('b');
    void run('c'); // b は c に上書きされる
    expect(seen).toEqual(['a']);

    gates[0]!.resolve();
    await flush();
    // 待たせた要求は 1 回だけ、最後の引数で走る（b は走らない）。
    expect(seen).toEqual(['a', 'c']);
    gates[1]!.resolve();
    await first;
  });

  it('前の実行が失敗しても、待たせた要求は走る', async () => {
    const seen: string[] = [];
    const gate = deferred();
    const run = coalesce(async (arg: string) => {
      seen.push(arg);
      if (arg === 'a') {
        await gate.promise;
        throw new Error('失敗');
      }
    });

    const first = run('a');
    void run('b');
    gate.resolve();
    await first;
    expect(seen).toEqual(['a', 'b']);
  });

  it('呼び出し側へ例外を投げない（取得できないだけ）', async () => {
    const run = coalesce(async () => {
      throw new Error('失敗');
    });
    await expect(run(undefined)).resolves.toBeUndefined();
  });
});
