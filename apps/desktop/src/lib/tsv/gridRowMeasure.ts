/**
 * 行高の実測を控える純ロジック。
 *
 * 行の `height` は表では最小高としてしか効かないので、折り返す列（wrap）を持つ行は
 * 宣言した高さより実際は高く出る。間引き（[`./gridWindow`]）が宣言高だけで詰め物を
 * 積むと、窓に入っている行だけ実際の高さで場所を取り、外の行は宣言高で数えられる。
 * 窓はスクロールのたびにずれるので、そのたび表全体の高さと行の位置が動く＝スクロールが
 * がたつき、表が震える。
 *
 * これを止めるには、描いたあとに測った高さを控えて次の窓計算へ返すしかない。測った値の
 * 出し入れだけをここに置き、DOM から測る部分は呼び出し側の薄いグルーに残す。
 */

/** 描いた行を測った結果。 */
export interface MeasuredSample {
  row: number;
  height: number;
}

/** 実測の揺れとみなす幅（px）。端数の上下で控えを書き換えると描き直しが止まらない。 */
export const MEASURE_EPSILON = 0.5;

/**
 * 実測を控えへ取り込む。1 行も動かなければ元の並びをそのまま返すので、呼び出し側は
 * 戻り値の同一性で「描き直す必要があるか」を判定できる。
 */
export function mergeMeasuredHeights(
  current: number[],
  samples: readonly MeasuredSample[],
  epsilon: number = MEASURE_EPSILON,
): number[] {
  let next: number[] | null = null;
  for (const { row, height } of samples) {
    if (!Number.isInteger(row) || row < 0) continue;
    if (!Number.isFinite(height) || height <= 0) continue;
    const known = current[row];
    if (known !== undefined && Math.abs(known - height) <= epsilon) continue;
    if (next === null) next = current.slice();
    next[row] = height;
  }
  return next ?? current;
}

/**
 * 窓計算へ渡す高さの並び（行数ぶん）。実測があればそれを、無ければ宣言高、宣言も無ければ
 * 既定高で数える。実測が宣言を下回るのは控えが古いときだけなので、宣言高まで戻す。
 */
export function effectiveRowHeights(
  declared: readonly number[],
  measured: readonly number[],
  total: number,
  defaultHeight: number,
): number[] {
  const heights: number[] = new Array(Math.max(0, total));
  for (let r = 0; r < heights.length; r += 1) {
    const base = declared[r] ?? defaultHeight;
    const actual = measured[r];
    heights[r] = actual === undefined ? base : Math.max(base, actual);
  }
  return heights;
}
