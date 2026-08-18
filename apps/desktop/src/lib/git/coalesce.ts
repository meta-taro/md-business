/**
 * 同じ更新要求が重なったときに、走らせる回数を 1 本へ畳む（DOM 非依存の純ロジック）。
 *
 * git の状態取得は保存のたびに走るが、1 回が子プロセス数本ぶんの待ちになる。保存が
 * 続くと要求だけが積み上がり、打ち終えたあとも子プロセスが行列で残る。実行中に来た
 * 要求はまとめて 1 回にし、最後の引数で追いかける（途中の引数は結果が捨てられるだけ）。
 */

/** 実行中の重複要求を 1 回へ畳んだ関数を返す。例外は呼び出し側へ伝えない。 */
export function coalesce<A>(run: (arg: A) => Promise<void>): (arg: A) => Promise<void> {
  let running = false;
  let pending: { arg: A } | null = null;

  async function invoke(arg: A): Promise<void> {
    running = true;
    try {
      await run(arg);
    } catch {
      // 取得できないだけ。次の要求で回復するので、待たせた分は続けて走らせる。
    } finally {
      running = false;
    }
    const next = pending;
    pending = null;
    if (next !== null) await invoke(next.arg);
  }

  return async (arg: A): Promise<void> => {
    if (running) {
      pending = { arg };
      return;
    }
    await invoke(arg);
  };
}
