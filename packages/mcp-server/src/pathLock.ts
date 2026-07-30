/**
 * パス単位の直列化（プロセス内ロック）。
 * -----------------------------------------------------------------------------
 * 行単位の書き込みは「全文を読む → 1 行足す / 差し替える → 全文を書き戻す」なので、
 * 同じファイルへの処理が重なると後から書いたほうが先の結果を上書きし、行が黙って消える。
 * AI クライアントは独立したツール呼び出しを並行で投げるのが普通なので、
 * 「3 行まとめて追記して」の一言でこれが起きうる。
 *
 * サーバーはリクエストごとに使い捨てられるが、ワークスペースを持つ store は 1 つを
 * 共有し続ける。プロセスも 1 つなので、ここで待ち行列を作れば重なりは防げる。
 * 逆に、**別プロセス**（エディタや Sheets 同期）からの同時書き込みまでは面倒を見ない。
 */

/** パスごとの待ち行列の最後尾。誰も待っていないパスは持たない。 */
const chains = new Map<string, Promise<unknown>>();

/**
 * 同じ `key` に対する処理を、呼び出した順に 1 つずつ実行する。
 * 別の `key` とは待ち合わせない。
 */
export function withPathLock<T>(key: string, run: () => Promise<T>): Promise<T> {
  const previous = chains.get(key) ?? Promise.resolve();
  // 前の処理が失敗しても自分は動かす（1 回の失敗でそのパスが詰まらないように）。
  const started = previous.then(run, run);
  const tail: Promise<unknown> = started.then(ignore, ignore);
  chains.set(key, tail);
  void tail.then(() => {
    // 自分が最後尾のままなら＝後続がいないので、パスの entry ごと捨てる。
    if (chains.get(key) === tail) chains.delete(key);
  });
  return started;
}

/** 待ち行列を持っているパスの数（テスト・監視用）。 */
export function pendingPathLockCount(): number {
  return chains.size;
}

function ignore(): void {
  /* 待ち行列を繋ぐためだけの then。結果も失敗も見ない。 */
}
