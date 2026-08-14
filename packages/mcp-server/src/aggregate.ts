/**
 * 集計ツール本体（aggregate）。
 * -----------------------------------------------------------------------------
 * 「いつ・何が・何件あったか」を、全文を読ませずに出すための層。要は 4 つ。
 *
 * 1. **数え上げは生の値で行い、伏せ字は返す直前にかける**。順序を逆にすると、
 *    伏せ字が同じ値になった別人が 1 つのキーに混ざって件数が狂う
 * 2. **読めない時刻を落とさない**。落とすと「その時間帯には何も無かった」に見える。
 *    読めなかった分は「時刻不明」として残し、合計に含める
 * 3. **キーの種類にも上限を持つ**。1 件 1 キーになる項目（ID など）で集計されると
 *    ファイルの中身がそのままメモリに載る
 * 4. **切ったら切ったと返す**。返すキーを絞っても、数え上げ自体は全件に効かせる
 */
import { maskRecord } from './maskSecrets.js';
import { addCounts, clamp, type MaskCounts } from './toolLimits.js';
import { compileConditions, type Condition, type ConditionMatch } from './conditions.js';
import { pick, readRecords, toText, type ReadStats, type RecordFormat } from './recordSource.js';
import { bucketLabel, parseTimestamp, type BucketUnit, type EpochUnit } from './timestamps.js';
import { resolveSource } from './records.js';
import type { LineSource } from './store.js';
import type { ToolError } from './tools.js';

/** 既定と上限。 */
const MAX_GROUPS_DEFAULT = 50;
const MAX_GROUPS_CEILING = 1000;

/**
 * 持てるキーの種類の上限。これを超えたら新しいキーは作らず、落とした件数を返す。
 * ID のような 1 件 1 キーの項目で集計されたときに、ファイル全体をメモリへ載せないため。
 */
const MAX_DISTINCT = 10_000;

/** 値が無いときのキー。空文字と区別が付くよう、文字で置く。 */
const NO_VALUE = 'なし';

/** 時刻として読めなかったときのキー。落とさずここへ集める。 */
const NO_TIME = '時刻不明';

/** キーの区切り。項目の値に現れない文字を使う（ソースには生の制御文字を置かない）。 */
const KEY_SEPARATOR = '\u0000';

export interface AggregateInput {
  /** ワークスペース相対パス。 */
  path: string;
  /** 形式。省略時は拡張子から判る場合のみ。 */
  format?: RecordFormat;
  /** 数える前に絞る条件。 */
  where?: Condition[];
  /** 条件の結び方（既定 all）。 */
  match?: ConditionMatch;
  /** キーにする項目（入れ子は `.` で辿る）。 */
  groupBy?: string[];
  /** 時間帯のキーにする項目。 */
  timeField?: string;
  /** 時間帯の単位（既定 hour）。timeField と一緒に指定する。 */
  bucket?: BucketUnit;
  /** 数値の時刻を読むときの単位。指定が無ければ数値は時刻として読まない。 */
  epoch?: EpochUnit;
  /** 返すキーの数の上限（既定 50・上限 1000）。 */
  maxGroups?: number;
  /** 並べ方（既定 count＝多い順）。 */
  sort?: 'count' | 'key';
}

export interface AggregateGroup {
  /** キー（伏せ字済み）。項目名がそのまま鍵になる。 */
  key: Record<string, string>;
  count: number;
}

export interface AggregateOk {
  ok: true;
  path: string;
  format: RecordFormat;
  /** 条件を満たしたレコード数（返したキーの分だけでなく全件）。 */
  total: number;
  groups: AggregateGroup[];
  /** 現れたキーの種類の数。 */
  distinctGroups: number;
  /** 上限で返すキーを絞ったか。 */
  truncated: boolean;
  /** キーの種類の上限に達したか。 */
  groupLimitReached: boolean;
  /** 上限に達したために、どのキーにも入れられなかったレコード数。 */
  droppedRecords: number;
  /** レコードとして読めなかった行数。 */
  skipped: number;
  /** 読んだ行数。 */
  scannedLines: number;
  masked: MaskCounts;
}

/**
 * 条件で絞ったレコードを、キー別・時間帯別に数える。
 */
export async function aggregate(
  store: LineSource,
  input: AggregateInput,
): Promise<AggregateOk | ToolError> {
  const source = resolveSource(input.path, input.format);
  if (!source.ok) return source;

  if (input.bucket !== undefined && input.timeField === undefined) {
    return { ok: false, error: 'bucket を使うには timeField が要ります。' };
  }

  const conditions = compileConditions(input.where, input.match);
  if (!conditions.ok) return conditions;

  const groupBy = input.groupBy ?? [];
  const bucket: BucketUnit = input.bucket ?? 'hour';
  const maxGroups = clamp(input.maxGroups, MAX_GROUPS_DEFAULT, 1, MAX_GROUPS_CEILING);
  const stats: ReadStats = { skipped: 0, scannedLines: 0 };

  /** キー文字列 → 表示用のキーと件数。 */
  const groups = new Map<string, { key: Record<string, string>; count: number }>();
  let total = 0;
  let droppedRecords = 0;
  let groupLimitReached = false;

  /** 時刻の項目を時間帯のラベルにする。読めなければ「時刻不明」。 */
  const timeLabel = (record: Record<string, unknown>): string => {
    const options = input.epoch === undefined ? undefined : { epoch: input.epoch };
    const parsed = parseTimestamp(pick(record, input.timeField ?? ''), options);
    return parsed === undefined ? NO_TIME : bucketLabel(parsed.ms, bucket);
  };

  try {
    for await (const item of readRecords(store, source.relative, source.format, stats)) {
      if (!conditions.matches(item.record)) continue;
      total += 1;

      const key: Record<string, string> = {};
      if (input.timeField !== undefined) key[input.timeField] = timeLabel(item.record);
      for (const field of groupBy) {
        key[field] = toText(pick(item.record, field)) ?? NO_VALUE;
      }

      const id = Object.values(key).join(KEY_SEPARATOR);
      const found = groups.get(id);
      if (found !== undefined) {
        found.count += 1;
        continue;
      }
      if (groups.size >= MAX_DISTINCT) {
        groupLimitReached = true;
        droppedRecords += 1;
        continue;
      }
      groups.set(id, { key, count: 1 });
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `ファイルを読めません: ${reason}` };
  }

  const ordered = [...groups.entries()].sort(([leftId, left], [rightId, right]) => {
    if (input.sort === 'key') return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
    if (left.count !== right.count) return right.count - left.count;
    // 件数が同じときは名前順にして、同じ入力で同じ順序が出るようにする。
    return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
  });

  const masked: MaskCounts = {};
  const shown: AggregateGroup[] = ordered.slice(0, maxGroups).map(([, group]) => {
    const result = maskRecord(group.key);
    addCounts(masked, result.counts);
    return { key: result.value as Record<string, string>, count: group.count };
  });

  return {
    ok: true,
    path: source.relative,
    format: source.format,
    total,
    groups: shown,
    distinctGroups: groups.size,
    truncated: ordered.length > shown.length,
    groupLimitReached,
    droppedRecords,
    skipped: stats.skipped,
    scannedLines: stats.scannedLines,
    masked,
  };
}
