/**
 * 時系列ツール本体（build_timeline）。
 * -----------------------------------------------------------------------------
 * 別々のファイルの行を、時刻順に 1 本へ混ぜる層。要は 4 つ。
 *
 * 1. **出どころを消さない**。混ぜた後でも「どのファイルの何行目か」が残らないと、
 *    並びだけ見て因果を読んでしまい、元に戻って確かめられない
 * 2. **読めない時刻の行を落とさない**。落とすと「その時間帯には何も無かった」に見える。
 *    時刻の位置には置けないので、末尾へ `time: null` として付ける
 * 3. **時刻を推測しない**。数値は `epoch` の指定があるときだけ読む
 * 4. **切ったら、どのファイルで切ったかまで返す**。窓を狭めて取り直す判断ができるように
 */
import { maskRecord } from './maskSecrets.js';
import { addCounts, clamp, type MaskCounts } from './toolLimits.js';
import { compileConditions, type Condition, type ConditionMatch } from './conditions.js';
import { pick, readRecords, type ReadStats, type RecordFormat } from './recordSource.js';
import { parseTimestamp, type EpochUnit } from './timestamps.js';
import { resolveSource } from './records.js';
import type { DocumentStore } from './store.js';
import type { ToolError } from './tools.js';

/** 既定と上限。 */
const MAX_EVENTS_DEFAULT = 200;
const MAX_EVENTS_CEILING = 2000;
const MAX_VALUE_LENGTH_DEFAULT = 2000;
const MAX_VALUE_LENGTH_CEILING = 20000;

/** 一度に混ぜられるファイルの数。多すぎると 1 回の応答に収まらない。 */
const MAX_SOURCES = 20;

export interface TimelineSource {
  /** ワークスペース相対パス。 */
  path: string;
  /** 形式。省略時は拡張子から判る場合のみ。 */
  format?: RecordFormat;
  /** 時刻にする項目（入れ子は `.` で辿る）。ファイルごとに名前が違うので個別に指定する。 */
  timeField: string;
  /** 出どころの表示名。省略するとパス。 */
  label?: string;
}

export interface BuildTimelineInput {
  sources: TimelineSource[];
  /** 混ぜる前に絞る条件（全ファイル共通）。 */
  where?: Condition[];
  /** 条件の結び方（既定 all）。 */
  match?: ConditionMatch;
  /** 時刻の窓（これ以降）。読めた時刻にだけ効く。 */
  from?: string;
  /** 時刻の窓（これ以前）。読めた時刻にだけ効く。 */
  to?: string;
  /** 数値の時刻を読むときの単位。指定が無ければ数値は時刻として読まない。 */
  epoch?: EpochUnit;
  /** 返す項目。省略するとレコード全体。 */
  fields?: string[];
  /** 返す出来事の数の上限（既定 200・上限 2000）。 */
  maxEvents?: number;
  /** 文字列 1 つあたりの文字数上限（既定 2000・上限 20000）。 */
  maxValueLength?: number;
}

export interface TimelineEvent {
  /** 出どころの表示名。 */
  source: string;
  /** ワークスペース相対パス。 */
  path: string;
  /** 1 始まりの行番号（元ファイルの物理行）。 */
  line: number;
  /** 時刻（UTC の ISO 8601）。読めなければ null。 */
  time: string | null;
  /** 伏せ字済みのレコード。 */
  record: Record<string, unknown>;
}

export interface TimelineSourceStat {
  path: string;
  format: RecordFormat;
  /** 条件を満たした件数（上限で読むのをやめた時点まで）。 */
  matched: number;
  /** 上限で読むのをやめたか。 */
  truncated: boolean;
  /** レコードとして読めなかった行数。 */
  skipped: number;
  /** 読んだ行数。 */
  scannedLines: number;
}

export interface BuildTimelineOk {
  ok: true;
  events: TimelineEvent[];
  /** どこかで上限に当たったか。 */
  truncated: boolean;
  /** 長さの上限で切った文字列の数。 */
  truncatedValues: number;
  /** 時刻として読めなかった出来事の数。 */
  unknownTime: number;
  sources: TimelineSourceStat[];
  masked: MaskCounts;
}

/** 並べ替えの前に持っておく形。時刻は数のまま持ち、返す直前に文字へ直す。 */
interface Collected {
  order: number;
  source: string;
  path: string;
  line: number;
  ms: number | undefined;
  record: Record<string, unknown>;
}

/**
 * 窓の指定を読む。読めない指定は、ファイルを開く前に断る。
 */
function parseWindow(
  value: string | undefined,
  name: 'from' | 'to',
  epoch: EpochUnit | undefined,
): { ok: true; ms: number | undefined } | ToolError {
  if (value === undefined) return { ok: true, ms: undefined };
  const options = epoch === undefined ? undefined : { epoch };
  const parsed = parseTimestamp(value, options);
  if (parsed === undefined) {
    return { ok: false, error: `${name} を時刻として読めません: ${value}` };
  }
  return { ok: true, ms: parsed.ms };
}

/**
 * 複数のファイルを時刻順に混ぜて返す。読むのは 1 行ずつで、全文はメモリに載せない。
 */
export async function buildTimeline(
  store: DocumentStore,
  input: BuildTimelineInput,
): Promise<BuildTimelineOk | ToolError> {
  if (input.sources.length === 0) {
    return { ok: false, error: 'sources に少なくとも 1 つのファイルが要ります。' };
  }
  if (input.sources.length > MAX_SOURCES) {
    return { ok: false, error: `一度に混ぜられるのは ${MAX_SOURCES} ファイルまでです。` };
  }

  const conditions = compileConditions(input.where, input.match);
  if (!conditions.ok) return conditions;

  const from = parseWindow(input.from, 'from', input.epoch);
  if (!from.ok) return from;
  const to = parseWindow(input.to, 'to', input.epoch);
  if (!to.ok) return to;

  const maxEvents = clamp(input.maxEvents, MAX_EVENTS_DEFAULT, 1, MAX_EVENTS_CEILING);
  const maxValueLength = clamp(
    input.maxValueLength,
    MAX_VALUE_LENGTH_DEFAULT,
    1,
    MAX_VALUE_LENGTH_CEILING,
  );

  const collected: Collected[] = [];
  const sources: TimelineSourceStat[] = [];
  let truncated = false;
  let order = 0;

  for (const source of input.sources) {
    const resolved = resolveSource(source.path, source.format);
    if (!resolved.ok) return resolved;

    const stats: ReadStats = { skipped: 0, scannedLines: 0 };
    const label = source.label ?? resolved.relative;
    let matched = 0;
    let sourceTruncated = false;

    try {
      for await (const item of readRecords(store, resolved.relative, resolved.format, stats)) {
        if (!conditions.matches(item.record)) continue;

        const options = input.epoch === undefined ? undefined : { epoch: input.epoch };
        const parsed = parseTimestamp(pick(item.record, source.timeField), options);
        // 窓は読めた時刻にだけ効かせる。読めない時刻を窓で落とすと、
        // 「この時間帯には何も無かった」と「時刻が壊れていた」の区別が付かなくなる。
        if (parsed !== undefined) {
          if (from.ms !== undefined && parsed.ms < from.ms) continue;
          if (to.ms !== undefined && parsed.ms > to.ms) continue;
        }

        if (matched >= maxEvents) {
          sourceTruncated = true;
          truncated = true;
          break;
        }
        matched += 1;
        collected.push({
          order: order++,
          source: label,
          path: resolved.relative,
          line: item.line,
          ms: parsed?.ms,
          record: item.record,
        });
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return { ok: false, error: `ファイルを読めません（${resolved.relative}）: ${reason}` };
    }

    sources.push({
      path: resolved.relative,
      format: resolved.format,
      matched,
      truncated: sourceTruncated,
      skipped: stats.skipped,
      scannedLines: stats.scannedLines,
    });
  }

  // 時刻順。読めなかったものは位置を決められないので末尾へ回す。
  // 同じ時刻のときは読んだ順にして、同じ入力で同じ並びが出るようにする。
  collected.sort((left, right) => {
    if (left.ms === undefined && right.ms === undefined) return left.order - right.order;
    if (left.ms === undefined) return 1;
    if (right.ms === undefined) return -1;
    if (left.ms !== right.ms) return left.ms - right.ms;
    return left.order - right.order;
  });

  if (collected.length > maxEvents) truncated = true;
  const shown = collected.slice(0, maxEvents);

  const masked: MaskCounts = {};
  let truncatedValues = 0;

  /** 返す直前の整形。伏せ字 → 長さの頭打ちの順で、順序を入れ替えない。 */
  const present = (record: Record<string, unknown>): Record<string, unknown> => {
    const projected: Record<string, unknown> = {};
    if (input.fields === undefined) {
      Object.assign(projected, record);
    } else {
      for (const field of input.fields) {
        const value = pick(record, field);
        if (value !== undefined) projected[field] = value;
      }
    }
    const result = maskRecord(projected);
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

  const events: TimelineEvent[] = shown.map((item) => ({
    source: item.source,
    path: item.path,
    line: item.line,
    time: item.ms === undefined ? null : new Date(item.ms).toISOString(),
    record: present(item.record),
  }));

  return {
    ok: true,
    events,
    truncated,
    truncatedValues,
    unknownTime: events.filter((event) => event.time === null).length,
    sources,
    masked,
  };
}
