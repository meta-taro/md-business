/**
 * レコードを絞る条件。
 * -----------------------------------------------------------------------------
 * **式を受け取らない**。条件は列挙した演算子の組み合わせだけで書く。
 * 文字列を評価する作りにすると、ツールの権限がそのまま任意コード実行になる。
 */
import { pick, toText } from './recordSource.js';
import type { ToolError } from './tools.js';

/**
 * 条件の演算子。**列挙したものが全て**。
 * `exists` / `missing` 以外は `value` が要る。
 */
export type ConditionOp =
  | 'eq'
  | 'ne'
  | 'contains'
  | 'startsWith'
  | 'endsWith'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'exists'
  | 'missing'
  | 'matches';

const OPS_NEEDING_VALUE = new Set<ConditionOp>([
  'eq',
  'ne',
  'contains',
  'startsWith',
  'endsWith',
  'gt',
  'gte',
  'lt',
  'lte',
  'matches',
]);

const ALL_OPS = new Set<ConditionOp>([...OPS_NEEDING_VALUE, 'exists', 'missing']);

export interface Condition {
  /** 項目名。入れ子は `.` で辿る（`user.id`）。 */
  field: string;
  op: ConditionOp;
  /** 比べる値。`exists` / `missing` では使わない。 */
  value?: string;
}

/** 条件の結び方。 */
export type ConditionMatch = 'all' | 'any';

/**
 * 両辺が数として読めるときだけ数として比べ、それ以外は文字列として比べる。
 * ログの項目は型が揃っていないので、どちらか一方に決め打つと使えない。
 */
function compare(text: string, expected: string): number {
  const a = Number(text);
  const b = Number(expected);
  const numeric =
    text.trim() !== '' && expected.trim() !== '' && Number.isFinite(a) && Number.isFinite(b);
  if (numeric) return a === b ? 0 : a < b ? -1 : 1;
  return text === expected ? 0 : text < expected ? -1 : 1;
}

/** 条件 1 つを判定する。`matches` は前もって組み立てた正規表現を使う。 */
function test(record: Record<string, unknown>, condition: Condition, matcher?: RegExp): boolean {
  const text = toText(pick(record, condition.field));
  if (condition.op === 'exists') return text !== undefined;
  if (condition.op === 'missing') return text === undefined;
  // 項目が無い行は「一致しない」。ne だけは「等しくない」が真になる。
  if (text === undefined) return condition.op === 'ne';

  const expected = condition.value ?? '';
  switch (condition.op) {
    case 'eq':
      return compare(text, expected) === 0;
    case 'ne':
      return compare(text, expected) !== 0;
    case 'contains':
      return text.includes(expected);
    case 'startsWith':
      return text.startsWith(expected);
    case 'endsWith':
      return text.endsWith(expected);
    case 'gt':
      return compare(text, expected) > 0;
    case 'gte':
      return compare(text, expected) >= 0;
    case 'lt':
      return compare(text, expected) < 0;
    case 'lte':
      return compare(text, expected) <= 0;
    case 'matches':
      return matcher !== undefined && matcher.test(text);
  }
}

export interface CompiledConditions {
  ok: true;
  /** 1 件のレコードが条件を満たすか。 */
  matches(record: Record<string, unknown>): boolean;
}

/**
 * 条件を検査して、判定する関数に畳む。
 * 不正な演算子・欠けた value・壊れた正規表現は、読み始める前に断る。
 */
export function compileConditions(
  where: Condition[] | undefined,
  match: ConditionMatch | undefined,
): CompiledConditions | ToolError {
  const conditions = where ?? [];
  const matchers: (RegExp | undefined)[] = [];

  for (const condition of conditions) {
    if (!ALL_OPS.has(condition.op)) {
      return { ok: false, error: `使えない条件です: ${String(condition.op)}` };
    }
    if (OPS_NEEDING_VALUE.has(condition.op) && condition.value === undefined) {
      return { ok: false, error: `${condition.op} には value が要ります: ${condition.field}` };
    }
    if (condition.op !== 'matches') {
      matchers.push(undefined);
      continue;
    }
    try {
      matchers.push(new RegExp(condition.value ?? ''));
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return { ok: false, error: `正規表現が不正です: ${reason}` };
    }
  }

  const matchAll = match !== 'any';
  return {
    ok: true,
    matches(record) {
      // 条件が無ければ全件通す（any でも「1 つも満たさない」で落とさない）。
      if (conditions.length === 0) return true;
      return matchAll
        ? conditions.every((condition, index) => test(record, condition, matchers[index]))
        : conditions.some((condition, index) => test(record, condition, matchers[index]));
    },
  };
}
