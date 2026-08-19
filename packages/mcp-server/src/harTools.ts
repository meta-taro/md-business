/**
 * HAR（通信の記録）用の MCP ツール本体。
 *
 * 「画面では動くのに繋ぐと失敗する」の調べ物は、まず通信を見るところから始まる。
 * HAR は DevTools・Charles・Proxyman・Playwright のどれもが吐く形で、復号済みの
 * HTTP がそのまま入っている。読む側に追加の道具は要らない。
 *
 * 口は 1 つにする。`index` を指せば 1 件の中身、指さなければ概況と一覧。
 * 切り口ごとにツールを増やすと、呼ぶ側は毎回どれを使うか選ぶことになり、
 * 「まず概況、次に 1 件」という調べ方の順序が消える。
 *
 * 本文は既定で返さない。HAR の中身は画像や JS が大半で、返しても調べる役に立たないうえ、
 * 1 回の応答で読む側の文脈が埋まる。要るときだけ `includeBody` で取り、上限で切ったと返す。
 *
 * 戻り値には必ず伏せ字をかける。HAR は秘密の置き場所が 2 つある（見出しの値と、
 * 名前が値の位置にいる組）ので、行ごとに見る規則だけでは素通りする。構造を歩く側を通す。
 */
import {
  describeHarEntry,
  filterHarEntries,
  harListItem,
  parseHar,
  summarizeHar,
  type DescribeHarEntryOptions,
  type HarDetail,
  type HarFilter,
  type HarListItem,
  type HarSummary,
} from './har.js';
import { maskRecord, type SecretKind } from './maskSecrets.js';
import { safeRelativePath } from './workspacePath.js';
import type { DocumentStore } from './store.js';
import type { ToolError } from './tools.js';

/**
 * 1 ファイルで受け付ける文字数。データファイル（4,000,000）より大きいのは、HAR が
 * 応答本文を base64 で抱えるため。1 画面ぶんの記録でも数十 MB になる。
 */
export const MAX_HAR_CHARS = 40_000_000;

/** 一覧に返す既定の件数。 */
export const READ_HAR_DEFAULT_LIMIT = 50;

/** 概況で挙げる遅い順の件数。 */
const SLOWEST_COUNT = 5;

export interface ReadHarInput extends HarFilter {
  /** ワークスペース相対パス。 */
  path: string;
  /** 中身を出す 1 件（元の entries[] の位置）。省略すると概況と一覧。 */
  index?: number;
  /** 本文を返すか（index を指したときだけ効く）。 */
  includeBody?: boolean;
  /** 本文の長さの上限。 */
  maxBodyLength?: number;
  /** 一覧に返す件数。省略時は 50。 */
  limit?: number;
  /** 一覧の開始位置。省略時は 0。 */
  offset?: number;
}

export type MaskCounts = Partial<Record<SecretKind, number>>;

export interface ReadHarOk {
  ok: true;
  path: string;
  /** 吐いた道具の名前（分かれば）。 */
  creator: string;
  /** ファイル全体の件数。 */
  total: number;
  /** 条件に当てはまった件数（index を指したときは 1）。 */
  matched: number;
  /** 一覧の開始位置。 */
  offset: number;
  /** 当てはまった分の概況。index を指したときは付かない。 */
  summary?: HarSummary;
  /** 一覧（本文は持たない）。index を指したときは空。 */
  entries: HarListItem[];
  /** 件数の上限で切ったか。 */
  truncated: boolean;
  /** index を指したときの中身。 */
  entry?: HarDetail;
  /** 伏せた件数（種別ごと）。 */
  masked: MaskCounts;
}

/** 指定された条件だけを渡す（exactOptionalPropertyTypes 下で undefined を明示しない）。 */
function toFilter(input: ReadHarInput): HarFilter {
  const filter: HarFilter = {};
  if (input.status !== undefined) filter.status = input.status;
  if (input.statusMin !== undefined) filter.statusMin = input.statusMin;
  if (input.statusMax !== undefined) filter.statusMax = input.statusMax;
  if (input.host !== undefined) filter.host = input.host;
  if (input.urlContains !== undefined) filter.urlContains = input.urlContains;
  if (input.method !== undefined) filter.method = input.method;
  if (input.from !== undefined) filter.from = input.from;
  if (input.to !== undefined) filter.to = input.to;
  return filter;
}

/** 伏せ字をかけて元と同じ形で返す（構造は変えない）。 */
function mask<T>(value: T, counts: MaskCounts): T {
  const result = maskRecord(value);
  for (const [kind, count] of Object.entries(result.counts)) {
    const key = kind as SecretKind;
    counts[key] = (counts[key] ?? 0) + count;
  }
  return result.value as T;
}

/** ワークスペースの HAR を読む。 */
export async function readHar(
  store: DocumentStore,
  input: ReadHarInput,
): Promise<ReadHarOk | ToolError> {
  const safe = safeRelativePath(input.path);
  if (!safe.ok) return { ok: false, error: safe.reason };
  if (!(await store.exists(safe.relative))) {
    return { ok: false, error: `ファイルが見つかりません: ${safe.relative}` };
  }

  const src = await store.read(safe.relative);
  if (src.length > MAX_HAR_CHARS) {
    return {
      ok: false,
      error: `ファイルが大きすぎます（${src.length} 文字・上限 ${MAX_HAR_CHARS}）。記録し直すときに対象を絞ってください。`,
    };
  }

  const parsed = parseHar(src);
  if (!parsed.ok) return { ok: false, error: `${safe.relative}: ${parsed.error}` };

  const masked: MaskCounts = {};
  const total = parsed.entries.length;

  if (input.index !== undefined) {
    const found = parsed.entries.find((item) => item.index === input.index);
    if (found === undefined) {
      return {
        ok: false,
        error: `${input.index} 番はありません（0 〜 ${Math.max(0, total - 1)} の ${total} 件）。`,
      };
    }
    const options: DescribeHarEntryOptions = {};
    if (input.includeBody !== undefined) options.includeBody = input.includeBody;
    if (input.maxBodyLength !== undefined) options.maxBodyLength = input.maxBodyLength;
    return {
      ok: true,
      path: safe.relative,
      creator: parsed.creator,
      total,
      matched: 1,
      offset: 0,
      entries: [],
      truncated: false,
      entry: mask(describeHarEntry(found, options), masked),
      masked,
    };
  }

  const matched = filterHarEntries(parsed.entries, toFilter(input));
  const limit = input.limit ?? READ_HAR_DEFAULT_LIMIT;
  const offset = input.offset ?? 0;
  if (!Number.isInteger(limit) || limit < 0) {
    return { ok: false, error: `limit は 0 以上の整数で指定してください: ${String(input.limit)}` };
  }
  if (!Number.isInteger(offset) || offset < 0) {
    return { ok: false, error: `offset は 0 以上の整数で指定してください: ${String(input.offset)}` };
  }
  const page = matched.slice(offset, offset + limit);

  return {
    ok: true,
    path: safe.relative,
    creator: parsed.creator,
    total,
    matched: matched.length,
    offset,
    // 概況は当てはまった分で出す。一覧だけ絞って概況が全件のままだと、
    // 絞り込みの結果を読み違える。
    summary: mask(summarizeHar(matched, SLOWEST_COUNT), masked),
    entries: mask(page.map(harListItem), masked),
    truncated: offset + page.length < matched.length,
    masked,
  };
}
