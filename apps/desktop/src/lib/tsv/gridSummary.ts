import type { TsvDocument } from '@md-business/schema-test-spec-tsv';
import { rangeBounds, type CellRange } from './gridRange';

/** 選んだ範囲にある数の要約。 */
export interface RangeSummary {
  /** 数として読めたセルの数（空セルと文字は入らない）。 */
  count: number;
  sum: number;
  average: number;
  min: number;
  max: number;
}

/**
 * 数として読む。桁区切りのカンマは落とす。読めなければ null。
 *
 * 指数表記（`1e3`）を弾くのは、number 列の検証と同じ書き方だけを数に数えるため。
 * 表に入っている値と、足し合わせに使う値がずれると、合計だけが説明できなくなる。
 */
function toNumber(cell: string): number | null {
  const text = cell.trim().replace(/,/g, '');
  if (text === '') {
    return null;
  }
  if (!/^[+-]?(\d+(\.\d+)?|\.\d+)$/.test(text)) {
    return null;
  }
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

/** 小数点以下の桁数。整数なら 0。 */
function decimalPlaces(value: number): number {
  const text = String(value);
  const dot = text.indexOf('.');
  return dot < 0 ? 0 : text.length - dot - 1;
}

/** 桁を上げすぎると整数で持てなくなるので、その手前で素直な足し算へ戻す。 */
const MAX_SCALE_DECIMALS = 10;

/**
 * 合計を出す。0.1 + 0.2 が 0.30000000000000004 になると、金額の合計として提出できない。
 * いちばん細かい桁に合わせて整数へ寄せてから足し、最後に戻す。
 */
function sumOf(values: number[]): number {
  const decimals = values.reduce((max, value) => Math.max(max, decimalPlaces(value)), 0);
  if (decimals === 0) {
    return values.reduce((total, value) => total + value, 0);
  }
  if (decimals > MAX_SCALE_DECIMALS) {
    return values.reduce((total, value) => total + value, 0);
  }
  const scale = 10 ** decimals;
  let scaled = 0;
  for (const value of values) {
    scaled += Math.round(value * scale);
    if (!Number.isSafeInteger(scaled)) {
      return values.reduce((total, value) => total + value, 0);
    }
  }
  return scaled / scale;
}

/** 1 つだけ選んでいるときにも出すと、ただ移動しているだけで足元が騒がしくなる。 */
const MIN_VALUES = 2;

/**
 * 選んだ範囲にある数を要約する。数として読めるセルが {@link MIN_VALUES} 未満なら null。
 *
 * 行数より下へはみ出した範囲（まだファイルに無い余白行）は読み飛ばす。
 */
export function summarizeRange(doc: TsvDocument, range: CellRange): RangeSummary | null {
  const { r0, c0, r1, c1 } = rangeBounds(range);
  const values: number[] = [];

  for (let row = r0; row <= r1 && row < doc.rows.length; row += 1) {
    for (let col = c0; col <= c1; col += 1) {
      const value = toNumber(doc.rows[row]?.[col] ?? '');
      if (value !== null) {
        values.push(value);
      }
    }
  }

  if (values.length < MIN_VALUES) {
    return null;
  }

  const sum = sumOf(values);
  return {
    count: values.length,
    sum,
    average: sum / values.length,
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

/** 平均が割り切れないときに桁を垂れ流さないための上限。 */
const MAX_DISPLAY_DECIMALS = 3;

/** 足元に出す形に整える。桁区切りを入れ、小数は必要な分だけ残す。 */
export function formatSummaryValue(value: number, locale: string): string {
  const options: Intl.NumberFormatOptions = {
    maximumFractionDigits: MAX_DISPLAY_DECIMALS,
  };
  try {
    return new Intl.NumberFormat(locale, options).format(value);
  } catch {
    return new Intl.NumberFormat(undefined, options).format(value);
  }
}
