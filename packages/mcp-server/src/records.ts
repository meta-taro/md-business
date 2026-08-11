/**
 * レコード調査ツール本体（filter_records）。
 * -----------------------------------------------------------------------------
 * 1 行 1 レコードのログ（JSONL / TSV）を条件で絞る層。要は 4 つ。
 *
 * 1. **式を受け取らない**。条件は列挙した演算子の組み合わせだけで書く。
 *    文字列を評価する作りにすると、ツールの権限がそのまま任意コード実行になる
 * 2. **絞り込みは生の値に当て、伏せ字は返す直前にかける**。順序を逆にすると
 *    「このメールアドレスの行を探す」ができなくなり、調査の道具として成立しない
 * 3. **読めない行で止まらない**。現場のログには壊れた行が混ざる。例外にして
 *    全部を失うのでも、黙って捨てるのでもなく、数えて返す
 * 4. **形式を推測しない**。拡張子で判らなければ断り、呼び出し側に指定させる
 */
import { safeRelativePath } from './workspacePath.js';
import { maskRecord } from './maskSecrets.js';
import { addCounts, clamp, type MaskCounts } from './toolLimits.js';
import { unescapeCell } from '@md-business/schema-test-spec-tsv';
import type { DocumentStore } from './store.js';
import type { ToolError } from './tools.js';

/** 既定と上限。呼び出し側が大きな値を指定しても、ここで頭を押さえる。 */
const MAX_RECORDS_DEFAULT = 200;
const MAX_RECORDS_CEILING = 2000;
const MAX_VALUE_LENGTH_DEFAULT = 2000;
const MAX_VALUE_LENGTH_CEILING = 20000;

/** 検証シートであることを示す 1 行目のマーカー（行頭 0 桁）。 */
const TEST_SPEC_MARKER = '#! md-business:test-spec-tsv/v1';

/** 読める形式。拡張子から判らないときは呼び出し側が指定する。 */
export type RecordFormat = 'jsonl' | 'tsv';

/**
 * 条件の演算子。**列挙したものが全て**で、式は受け付けない。
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

export interface FilterRecordsInput {
  /** ワークスペース相対パス。 */
  path: string;
  /** 形式。省略時は拡張子から判る場合のみ。 */
  format?: RecordFormat;
  /** 条件。省略すると全件。 */
  where?: Condition[];
  /** 条件の結び方（既定 all）。 */
  match?: 'all' | 'any';
  /** 返す項目（`.` 区切りで指定した文字列がそのまま鍵になる）。省略すると全体。 */
  fields?: string[];
  /** 返すレコード数の上限（既定 200・上限 2000）。 */
  maxRecords?: number;
  /** 文字列 1 つあたりの文字数上限（既定 2000・上限 20000）。 */
  maxValueLength?: number;
}

export interface FilteredRecord {
  /** 1 始まりの行番号（元ファイルの物理行）。 */
  line: number;
  /** 伏せ字済みのレコード。 */
  record: Record<string, unknown>;
}

export interface FilterRecordsOk {
  ok: true;
  path: string;
  format: RecordFormat;
  records: FilteredRecord[];
  /** 上限で読むのをやめたか（先にまだあるかもしれない）。 */
  truncated: boolean;
  /** 長さの上限で切った文字列の数。 */
  truncatedValues: number;
  /** レコードとして読めなかった行数（空行・`#` 行は数えない）。 */
  skipped: number;
  /** 読んだ行数。 */
  scannedLines: number;
  masked: MaskCounts;
}

/** 入れ子を `.` で辿る。無ければ undefined。 */
function pick(record: unknown, field: string): unknown {
  let node: unknown = record;
  for (const key of field.split('.')) {
    if (node === null || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[key];
  }
  return node;
}

/** 比較に使う文字列。無い項目は undefined（「空文字」と区別する）。 */
function toText(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'string') return value;
  if (value === null) return 'null';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value) ?? undefined;
}

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

/** 拡張子から形式を決める。判らなければ undefined（推測しない）。 */
function formatFromPath(relative: string): RecordFormat | undefined {
  const lower = relative.toLowerCase();
  if (lower.endsWith('.jsonl') || lower.endsWith('.ndjson')) return 'jsonl';
  if (lower.endsWith('.tsv')) return 'tsv';
  return undefined;
}

/** TSV の見出しを列名の配列にする。空の見出しは列番号で埋める。 */
function headerNames(cells: string[]): string[] {
  return cells.map((cell, index) => (cell === '' ? `column ${index + 1}` : cell));
}

/**
 * 条件で行を絞って返す。読むのは 1 行ずつで、全文はメモリに載せない。
 */
export async function filterRecords(
  store: DocumentStore,
  input: FilterRecordsInput,
): Promise<FilterRecordsOk | ToolError> {
  const safe = safeRelativePath(input.path);
  if (!safe.ok) return { ok: false, error: safe.reason };

  const format = input.format ?? formatFromPath(safe.relative);
  if (format === undefined) {
    return {
      ok: false,
      error: `拡張子から形式を判別できません。format に jsonl か tsv を指定してください: ${safe.relative}`,
    };
  }

  const conditions = input.where ?? [];
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

  const matchAll = input.match !== 'any';
  const maxRecords = clamp(input.maxRecords, MAX_RECORDS_DEFAULT, 1, MAX_RECORDS_CEILING);
  const maxValueLength = clamp(
    input.maxValueLength,
    MAX_VALUE_LENGTH_DEFAULT,
    1,
    MAX_VALUE_LENGTH_CEILING,
  );

  const masked: MaskCounts = {};
  const records: FilteredRecord[] = [];
  let truncated = false;
  let truncatedValues = 0;
  let skipped = 0;
  let scannedLines = 0;

  /** TSV の見出し（最初のレコード行より前に決まる）。 */
  let header: string[] | undefined;
  /** 検証シート形式なら、セルのエスケープを戻してから条件に当てる。 */
  let unescape = false;

  /** 返す直前の整形。伏せ字 → 長さの頭打ちの順で、順序を入れ替えない。 */
  const present = (record: Record<string, unknown>): Record<string, unknown> => {
    const result = maskRecord(record);
    addCounts(masked, result.counts);
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(result.value as Record<string, unknown>)) {
      if (typeof value === 'string' && value.length > maxValueLength) {
        truncatedValues += 1;
        out[key] = value.slice(0, maxValueLength);
        continue;
      }
      out[key] = value;
    }
    return out;
  };

  const project = (record: Record<string, unknown>): Record<string, unknown> => {
    if (input.fields === undefined) return record;
    const out: Record<string, unknown> = {};
    for (const field of input.fields) {
      const value = pick(record, field);
      if (value !== undefined) out[field] = value;
    }
    return out;
  };

  try {
    for await (const raw of store.lines(safe.relative)) {
      scannedLines += 1;

      let record: Record<string, unknown> | undefined;
      if (format === 'jsonl') {
        if (raw.trim() === '') continue;
        try {
          const parsed: unknown = JSON.parse(raw);
          // 配列や数値の行は「1 行 1 レコード」ではないので、読めなかった側に数える。
          if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
            record = parsed as Record<string, unknown>;
          }
        } catch {
          record = undefined;
        }
        if (record === undefined) {
          skipped += 1;
          continue;
        }
      } else {
        if (scannedLines === 1 && raw.startsWith(TEST_SPEC_MARKER)) unescape = true;
        if (raw.trim() === '' || raw.startsWith('#')) continue;
        const cells = raw.split('\t').map((cell) => (unescape ? unescapeCell(cell) : cell));
        if (header === undefined) {
          header = headerNames(cells);
          continue;
        }
        const row: Record<string, unknown> = {};
        cells.forEach((cell, index) => {
          row[header?.[index] ?? `column ${index + 1}`] = cell;
        });
        record = row;
      }

      const current = record;
      // 条件が無ければ全件通す（any でも「1 つも満たさない」で落とさない）。
      const hit =
        conditions.length === 0 ||
        (matchAll
          ? conditions.every((condition, index) => test(current, condition, matchers[index]))
          : conditions.some((condition, index) => test(current, condition, matchers[index])));
      if (!hit) continue;

      if (records.length >= maxRecords) {
        truncated = true;
        break;
      }
      records.push({ line: scannedLines, record: present(project(current)) });
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `ファイルを読めません: ${reason}` };
  }

  return {
    ok: true,
    path: safe.relative,
    format,
    records,
    truncated,
    truncatedValues,
    skipped,
    scannedLines,
    masked,
  };
}
