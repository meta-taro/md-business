/**
 * トレーリング debounce。連続呼び出しを合流し、最後の呼び出しから `waitMs`
 * 経過後に最後の引数で 1 回だけ実行する。CodeMirror の変更イベントを
 * プレビュー再描画（§6.2・既定 150–250ms）へ間引くために使う。
 *
 * `cancel()` で保留中の発火を破棄する（コンポーネント破棄時のリーク防止）。
 */
export interface Debounced<A extends unknown[]> {
  (...args: A): void;
  /** 保留中の発火を破棄する。 */
  cancel(): void;
}

export function debounce<A extends unknown[]>(
  fn: (...args: A) => void,
  waitMs: number,
): Debounced<A> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const debounced = (...args: A): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      fn(...args);
    }, waitMs);
  };

  debounced.cancel = (): void => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  };

  return debounced;
}
