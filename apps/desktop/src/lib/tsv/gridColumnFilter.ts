/**
 * 列ごとの絞り込み条件 — 条件に当たらない行を決める（DOM 非依存の純ロジック）。
 *
 * 決めるのは {@link ./gridFilter} と同じく **外す側の行 ID**。条件を変えた時点で一度だけ数え、
 * その集合を持ち続ける（値を直した行が目の前から消えないように）。
 *
 * 条件を外すと外れていた行が戻る必要があるので、渡す doc は絞り込む前の表全体にする。
 */
import type { IdentifiedTsv } from '@md-business/schema-test-spec-tsv';
import { dateKeyOf, numberOf } from './gridSort';

/** 1 列分の絞り込み条件。 */
export type ColumnCondition =
  /** 一覧から選んだ値のどれか（空欄は `''`）。前後の空白は見ない。 */
  | { kind: 'values'; values: readonly string[] }
  /** 文字を含む（大文字小文字は区別しない）。 */
  | { kind: 'text'; text: string }
  /** 下限以上・上限以下。片側が空ならその側は決めない。日付は日単位で比べる。 */
  | { kind: 'range'; type: 'number' | 'date'; min: string; max: string };

function inRange(value: string, cond: Extract<ColumnCondition, { kind: 'range' }>): boolean {
  if (cond.type === 'number') {
    const n = numberOf(value);
    if (n === null) return false;
    const min = numberOf(cond.min);
    const max = numberOf(cond.max);
    return (min === null || n >= min) && (max === null || n <= max);
  }
  // 時刻付きの列でも、上限の日を丸ごと含めたいので日の部分だけで比べる。
  const day = dateKeyOf(value)?.slice(0, 10);
  if (day === undefined) return false;
  const min = dateKeyOf(cond.min)?.slice(0, 10);
  const max = dateKeyOf(cond.max)?.slice(0, 10);
  return (min === undefined || day >= min) && (max === undefined || day <= max);
}

/** セルの値が条件に当たるか。 */
export function matchesCondition(value: string, cond: ColumnCondition): boolean {
  switch (cond.kind) {
    case 'values':
      return cond.values.includes(value.trim());
    case 'text': {
      const needle = cond.text.trim().toLowerCase();
      return needle === '' || value.toLowerCase().includes(needle);
    }
    case 'range':
      return inRange(value, cond);
  }
}

/**
 * 列ごとの条件のどれか 1 つにでも当たらない行の ID（条件どうしは AND）。
 *
 * @param conditions 列番号 → 条件。
 */
export function excludedByConditions(
  doc: IdentifiedTsv,
  conditions: ReadonlyMap<number, ColumnCondition>,
): Set<string> {
  const excluded = new Set<string>();
  if (conditions.size === 0) return excluded;

  doc.rows.forEach((cells, index) => {
    for (const [col, cond] of conditions) {
      if (!matchesCondition(cells[col] ?? '', cond)) {
        excluded.add(doc.rowIds[index] ?? '');
        return;
      }
    }
  });
  return excluded;
}
