/**
 * ログの項目から「時刻」と「結合キー」の候補を挙げる。
 * -----------------------------------------------------------------------------
 * どのファイルのどの項目が時刻なのか、どれを突き合わせれば同じ 1 件になるのかは、
 * 開いてみるまで分からない。人に全部を打たせると使えないので候補を出すが、
 * ここで出るのは**候補であって事実ではない**。決めごとは 3 つ。
 *
 * 1. **なぜ挙がったかを一緒に返す**。名前が似ているだけなのか、値が実際に
 *    時刻として読めたのかで確かさが違う。混ぜて 1 つの並びにすると、
 *    受け取る側は区別できない
 * 2. **候補を勝手に選ばない**。返すのは並びだけで、選ぶのは呼び出し側（＝人）
 * 3. **標本の中の事実しか数えない**。「たぶん重なる」は数えない。重なりは
 *    実際に同じ値が現れた種類数だけを返す
 */
import { parseTimestamp, pick, toText, type EpochUnit } from '@md-business/mcp-server/logs';

/** 入れ子を辿る深さの上限。深追いすると候補が増えすぎて選べなくなる。 */
const MAX_DEPTH = 3;

/** 候補を挙げるために読むレコード数の上限。 */
export const SAMPLE_RECORDS = 50;

/** 名前が時刻らしい項目。正規化（小文字・記号落とし）した後で照合する。 */
const TIME_NAMES = new Set([
  'ts',
  'time',
  'timestamp',
  'datetime',
  'date',
  'when',
  'occurred',
  'logged',
]);

/** 名前が識別子らしい項目。並べ替えの手掛かりにするだけで、候補の可否には使わない。 */
const ID_SUFFIXES = ['id', 'key', 'uuid', 'guid', 'no'];

function normalize(field: string): string {
  const leaf = field.slice(field.lastIndexOf('.') + 1);
  return leaf.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** 名前だけで時刻らしいと言えるか。 */
function looksLikeTimeName(field: string): boolean {
  const leaf = field.slice(field.lastIndexOf('.') + 1);
  const norm = normalize(field);
  if (TIME_NAMES.has(norm)) return true;
  if (norm.endsWith('time') || norm.endsWith('timestamp') || norm.endsWith('date')) return true;
  // created_at / createdAt のような「〜した時刻」。`format` のような語を拾わないよう、
  // 正規化前の区切り（`_` や大文字）が残っているものだけ見る。
  return /(^|[_\-.])at$/.test(leaf) || /[a-z0-9]At$/.test(leaf);
}

function looksLikeIdName(field: string): boolean {
  const norm = normalize(field);
  return ID_SUFFIXES.some((suffix) => norm.endsWith(suffix));
}

/**
 * レコードを `a.b.c` の形の葉に開く。値の無い枝は返さない。
 *
 * 配列へは入らない。`items.0.id` のような番号付きの名前は、標本の 1 件目でしか
 * 通用しないので候補として役に立たない。
 */
function leafFields(record: Record<string, unknown>, prefix = '', depth = 1): string[] {
  const fields: string[] = [];
  for (const [key, value] of Object.entries(record)) {
    const path = prefix === '' ? key : `${prefix}.${key}`;
    if (
      depth < MAX_DEPTH &&
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      Object.keys(value).length > 0
    ) {
      fields.push(...leafFields(value as Record<string, unknown>, path, depth + 1));
      continue;
    }
    fields.push(path);
  }
  return fields;
}

/** 標本に現れた項目を、最初に見つかった順で返す。 */
function fieldsOf(records: readonly Record<string, unknown>[]): string[] {
  const seen = new Set<string>();
  const fields: string[] = [];
  for (const record of records.slice(0, SAMPLE_RECORDS)) {
    for (const field of leafFields(record)) {
      if (seen.has(field)) continue;
      seen.add(field);
      fields.push(field);
    }
  }
  return fields;
}

/** なぜ候補に挙がったか。確かさの順に並べるための区分でもある。 */
export type TimeFieldEvidence =
  /** 名前も時刻らしく、値も時刻として読めた。 */
  | 'nameAndValue'
  /** 名前は時刻らしくないが、値が時刻として読めた。 */
  | 'valueOnly'
  /** 名前は時刻らしいが、値を時刻として読めなかった。 */
  | 'nameOnly';

export interface TimeFieldCandidate {
  /** `pick` と同じ書き方の項目名（入れ子は `.`）。 */
  field: string;
  evidence: TimeFieldEvidence;
  /** 標本のうち時刻として読めた件数。 */
  parsed: number;
  /** その項目に値があった標本の件数。 */
  sampled: number;
}

const EVIDENCE_ORDER: Record<TimeFieldEvidence, number> = {
  nameAndValue: 0,
  valueOnly: 1,
  nameOnly: 2,
};

export interface TimeFieldOptions {
  /** 数値を時刻として読むときの単位。指定が無ければ数値は時刻として読まない。 */
  epoch?: EpochUnit;
}

/**
 * 時刻にできそうな項目を、確かさの順に返す。
 *
 * 名前も値も手掛かりにならない項目は返さない。返り値が空なら、
 * 「候補が無い」＝人が項目名を打つ、で正しい。
 */
export function timeFieldCandidates(
  records: readonly Record<string, unknown>[],
  options?: TimeFieldOptions,
): TimeFieldCandidate[] {
  const sample = records.slice(0, SAMPLE_RECORDS);
  const parseOptions = options?.epoch === undefined ? undefined : { epoch: options.epoch };
  const candidates: TimeFieldCandidate[] = [];

  for (const field of fieldsOf(sample)) {
    let parsed = 0;
    let sampled = 0;
    for (const record of sample) {
      const value = pick(record, field);
      if (value === undefined) continue;
      sampled += 1;
      if (parseTimestamp(value, parseOptions) !== undefined) parsed += 1;
    }
    if (sampled === 0) continue;

    const byName = looksLikeTimeName(field);
    if (parsed === 0 && !byName) continue;
    const evidence: TimeFieldEvidence =
      parsed === 0 ? 'nameOnly' : byName ? 'nameAndValue' : 'valueOnly';
    candidates.push({ field, evidence, parsed, sampled });
  }

  return candidates.sort((left, right) => {
    const order = EVIDENCE_ORDER[left.evidence] - EVIDENCE_ORDER[right.evidence];
    if (order !== 0) return order;
    // 同じ区分なら、読めた割合の高いほうを先に。
    const ratio = right.parsed / right.sampled - left.parsed / left.sampled;
    if (ratio !== 0) return ratio;
    return left.field.localeCompare(right.field);
  });
}

export interface JoinKeyField {
  path: string;
  field: string;
}

export interface JoinKeyCandidate {
  /** 渡されたファイルの並び順に対応する項目名。その項目が無いファイルは含まない。 */
  fields: JoinKeyField[];
  /** どのファイルでも名前がそのまま同じか。false は書き方を揃えて寄せた推測。 */
  exact: boolean;
  /** 標本の中で、2 つ以上のファイルに同じ値が現れた**種類**の数。0 なら名前が似ているだけ。 */
  sharedValues: number;
  /** 名前が識別子らしいか。並びの手掛かりで、これだけでは根拠にならない。 */
  idLike: boolean;
}

export interface JoinKeySample {
  path: string;
  records: readonly Record<string, unknown>[];
}

/**
 * 複数のファイルにまたがる項目を、突き合わせの候補として返す。
 *
 * 書き方の違い（`request_id` / `requestId` / `RequestID`）は同じものとして寄せるが、
 * 寄せたことは `exact: false` として残す。名前が似ているだけの別物を、
 * 一致したかのように見せないため。
 */
export function joinKeyCandidates(samples: readonly JoinKeySample[]): JoinKeyCandidate[] {
  /** 正規化した名前 -> ファイルごとの（項目名・値の集合）。 */
  const groups = new Map<string, Map<string, { field: string; values: Set<string> }>>();

  for (const sample of samples) {
    const records = sample.records.slice(0, SAMPLE_RECORDS);
    for (const field of fieldsOf(records)) {
      const key = normalize(field);
      if (key === '') continue;
      const perPath = groups.get(key) ?? new Map();
      groups.set(key, perPath);
      // 同じファイルで正規化後が衝突したら、先に見つけたほうを採る（標本の並び順が正）。
      const entry = perPath.get(sample.path) ?? { field, values: new Set<string>() };
      perPath.set(sample.path, entry);
      for (const record of records) {
        const text = toText(pick(record, entry.field));
        // 空の値はどのファイルにもあるので、重なりの根拠にならない。
        if (text === undefined || text === '') continue;
        entry.values.add(text);
      }
    }
  }

  const candidates: JoinKeyCandidate[] = [];
  for (const perPath of groups.values()) {
    // 1 つのファイルにしか無い項目は、突き合わせようがない。
    if (perPath.size < 2) continue;

    const fields: JoinKeyField[] = [];
    for (const sample of samples) {
      const entry = perPath.get(sample.path);
      if (entry !== undefined) fields.push({ path: sample.path, field: entry.field });
    }

    const counts = new Map<string, number>();
    for (const entry of perPath.values()) {
      for (const value of entry.values) counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    let sharedValues = 0;
    for (const count of counts.values()) if (count >= 2) sharedValues += 1;

    const names = new Set(fields.map((f) => f.field));
    candidates.push({
      fields,
      exact: names.size === 1,
      sharedValues,
      idLike: looksLikeIdName(fields[0].field),
    });
  }

  return candidates.sort((left, right) => {
    if (left.sharedValues !== right.sharedValues) return right.sharedValues - left.sharedValues;
    if (left.exact !== right.exact) return left.exact ? -1 : 1;
    if (left.idLike !== right.idLike) return left.idLike ? -1 : 1;
    if (left.fields.length !== right.fields.length) return right.fields.length - left.fields.length;
    return left.fields[0].field.localeCompare(right.fields[0].field);
  });
}
