/**
 * レコード調査ツール本体（filter_records）。
 * -----------------------------------------------------------------------------
 * 1 行 1 レコードのログ（JSONL / TSV）を条件で絞る層。要は 4 つ。
 *
 * 1. **式を受け取らない**。条件は列挙した演算子の組み合わせだけで書く（conditions.ts）
 * 2. **絞り込みは生の値に当て、伏せ字は返す直前にかける**。順序を逆にすると
 *    「このメールアドレスの行を探す」ができなくなり、調査の道具として成立しない
 * 3. **読めない行で止まらない**。現場のログには壊れた行が混ざる。例外にして
 *    全部を失うのでも、黙って捨てるのでもなく、数えて返す（recordSource.ts）
 * 4. **形式を推測しない**。拡張子で判らなければ断り、呼び出し側に指定させる
 */
import { safeRelativePath } from './workspacePath.js';
import { maskRecord } from './maskSecrets.js';
import { addCounts, clamp, type MaskCounts } from './toolLimits.js';
import { compileConditions, type Condition, type ConditionMatch } from './conditions.js';
import {
  formatFromPath,
  pick,
  readRecords,
  type ReadStats,
  type RecordFormat,
} from './recordSource.js';
import type { LineSource } from './store.js';
import type { ToolError } from './tools.js';

export type { Condition, ConditionOp, ConditionMatch } from './conditions.js';
export type { RecordFormat } from './recordSource.js';

/** 既定と上限。呼び出し側が大きな値を指定しても、ここで頭を押さえる。 */
const MAX_RECORDS_DEFAULT = 200;
const MAX_RECORDS_CEILING = 2000;
const MAX_VALUE_LENGTH_DEFAULT = 2000;
const MAX_VALUE_LENGTH_CEILING = 20000;

export interface FilterRecordsInput {
  /** ワークスペース相対パス。 */
  path: string;
  /** 形式。省略時は拡張子から判る場合のみ。 */
  format?: RecordFormat;
  /** 条件。省略すると全件。 */
  where?: Condition[];
  /** 条件の結び方（既定 all）。 */
  match?: ConditionMatch;
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

/**
 * パスと形式を確かめる。形式が判らなければ、推測せず断る。
 */
export function resolveSource(
  path: string,
  format: RecordFormat | undefined,
): { ok: true; relative: string; format: RecordFormat } | ToolError {
  const safe = safeRelativePath(path);
  if (!safe.ok) return { ok: false, error: safe.reason };

  const resolved = format ?? formatFromPath(safe.relative);
  if (resolved === undefined) {
    return {
      ok: false,
      error: `拡張子から形式を判別できません。format に jsonl か tsv を指定してください: ${safe.relative}`,
    };
  }
  return { ok: true, relative: safe.relative, format: resolved };
}

/**
 * 条件で行を絞って返す。読むのは 1 行ずつで、全文はメモリに載せない。
 */
export async function filterRecords(
  store: LineSource,
  input: FilterRecordsInput,
): Promise<FilterRecordsOk | ToolError> {
  const source = resolveSource(input.path, input.format);
  if (!source.ok) return source;

  const conditions = compileConditions(input.where, input.match);
  if (!conditions.ok) return conditions;

  const maxRecords = clamp(input.maxRecords, MAX_RECORDS_DEFAULT, 1, MAX_RECORDS_CEILING);
  const maxValueLength = clamp(
    input.maxValueLength,
    MAX_VALUE_LENGTH_DEFAULT,
    1,
    MAX_VALUE_LENGTH_CEILING,
  );

  const masked: MaskCounts = {};
  const records: FilteredRecord[] = [];
  const stats: ReadStats = { skipped: 0, scannedLines: 0 };
  let truncated = false;
  let truncatedValues = 0;

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
    for await (const item of readRecords(store, source.relative, source.format, stats)) {
      if (!conditions.matches(item.record)) continue;
      if (records.length >= maxRecords) {
        truncated = true;
        break;
      }
      records.push({ line: item.line, record: present(project(item.record)) });
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `ファイルを読めません: ${reason}` };
  }

  return {
    ok: true,
    path: source.relative,
    format: source.format,
    records,
    truncated,
    truncatedValues,
    skipped: stats.skipped,
    scannedLines: stats.scannedLines,
    masked,
  };
}
