/**
 * HAR（HTTP Archive）の読み取り。
 *
 * HAR は DevTools の「Save all as HAR」や Charles / Proxyman / Playwright が吐く JSON で、
 * 復号済みの HTTP がそのまま入っている。外部の道具を足さずに読めるのが利点。
 *
 * ここは純粋な層に閉じる（ファイルの読み書きも伏せ字も持たない）。伏せ字は返す直前に
 * 呼ぶ側でかける。HAR の秘密は名前が値の位置にいる（`{"name":"Authorization","value":"…"}`）
 * ので、行ごとに見る規則は素通りする。構造を歩く伏せ字を必ず通すこと。
 *
 * 壊れた HAR を黙って空にしない。0 件なのか読めなかったのかが区別できないと、
 * 「その通信は無かった」と誤って読める。
 */

/** 一覧に出す 1 件分。本文は持たない（大半が画像や JS で、調べるのに要らない）。 */
export interface HarListItem {
  /** 元の `entries[]` の位置。中身を出すときにこれで指す。 */
  index: number;
  /** 開始時刻。読めなければ null。 */
  startedDateTime: string | null;
  method: string;
  url: string;
  /** URL として読めなければ空。 */
  host: string;
  path: string;
  status: number | null;
  statusText: string;
  /** 所要時間（ミリ秒）。読めなければ null。 */
  time: number | null;
  mimeType: string;
  /** 応答本文の大きさ（バイト）。読めなければ null。 */
  size: number | null;
}

/** 一覧の項目に、中身を出すための元データを添えたもの。 */
export interface HarEntry extends HarListItem {
  /** 元の entry。戻り値へそのまま載せない。 */
  raw: Record<string, unknown>;
}

export interface HarParseOk {
  ok: true;
  /** 吐いた道具の名前（分かれば）。 */
  creator: string;
  entries: HarEntry[];
}

export interface HarParseError {
  ok: false;
  error: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asTime(value: unknown): string | null {
  const text = asText(value);
  if (text === '') return null;
  const at = Date.parse(text);
  return Number.isFinite(at) ? new Date(at).toISOString() : null;
}

function splitUrl(url: string): { host: string; path: string } {
  try {
    const parsed = new URL(url);
    return { host: parsed.host, path: parsed.pathname };
  } catch {
    // 相対や壊れた URL でも記録としては残す。読めなかったのは分け方だけ。
    return { host: '', path: '' };
  }
}

function toEntry(raw: Record<string, unknown>, index: number): HarEntry {
  const request = asRecord(raw['request']);
  const response = asRecord(raw['response']);
  const content = asRecord(response['content']);
  const url = asText(request['url']);
  const { host, path } = splitUrl(url);
  return {
    index,
    startedDateTime: asTime(raw['startedDateTime']),
    method: asText(request['method']),
    url,
    host,
    path,
    status: asNumber(response['status']),
    statusText: asText(response['statusText']),
    time: asNumber(raw['time']),
    mimeType: asText(content['mimeType']),
    size: asNumber(content['size']),
    raw,
  };
}

/** 一覧へ出す形（元データを落とす）。 */
export function harListItem(entry: HarEntry): HarListItem {
  const { raw: _raw, ...rest } = entry;
  return rest;
}

/** HAR の本文を読む。HAR でなければ理由を返す。 */
export function parseHar(text: string): HarParseOk | HarParseError {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, error: 'JSON として読めません（HAR かどうか確かめてください）' };
  }
  const log = asRecord(asRecord(value)['log']);
  if (!Array.isArray(log['entries'])) {
    return { ok: false, error: 'HAR ではありません（log.entries が見つかりません）' };
  }
  return {
    ok: true,
    creator: asText(asRecord(log['creator'])['name']),
    entries: asArray(log['entries']).map(toEntry),
  };
}

export interface HarFilter {
  /** ちょうどこのステータス。 */
  status?: number;
  /** これ以上のステータス（400 で失敗だけを見る）。 */
  statusMin?: number;
  /** これ以下のステータス。 */
  statusMax?: number;
  /** ホスト（大文字小文字を問わない完全一致）。 */
  host?: string;
  /** URL に含まれる文字列。 */
  urlContains?: string;
  /** 手立て（GET / POST。大文字小文字を問わない）。 */
  method?: string;
  /** この時刻以降。 */
  from?: string;
  /** この時刻以前。 */
  to?: string;
}

/** 条件で絞る。時刻の窓は、時刻が読めた分にだけ効く。 */
export function filterHarEntries(entries: HarEntry[], filter: HarFilter): HarEntry[] {
  const from = filter.from === undefined ? null : Date.parse(filter.from);
  const to = filter.to === undefined ? null : Date.parse(filter.to);
  const host = filter.host?.toLowerCase();
  const method = filter.method?.toLowerCase();
  return entries.filter((entry) => {
    if (filter.status !== undefined && entry.status !== filter.status) return false;
    if (filter.statusMin !== undefined && (entry.status ?? -1) < filter.statusMin) return false;
    if (filter.statusMax !== undefined && (entry.status ?? Number.MAX_SAFE_INTEGER) > filter.statusMax) {
      return false;
    }
    if (host !== undefined && entry.host.toLowerCase() !== host) return false;
    if (method !== undefined && entry.method.toLowerCase() !== method) return false;
    if (filter.urlContains !== undefined && !entry.url.includes(filter.urlContains)) return false;
    if (from !== null || to !== null) {
      if (entry.startedDateTime === null) return false;
      const at = Date.parse(entry.startedDateTime);
      if (from !== null && at < from) return false;
      if (to !== null && at > to) return false;
    }
    return true;
  });
}

export interface HarCount {
  key: string;
  count: number;
}

export interface HarSummary {
  total: number;
  /** 最初と最後の時刻。読めた時刻が 1 つも無ければ null。 */
  timeRange: { from: string; to: string } | null;
  byStatus: HarCount[];
  byHost: HarCount[];
  /** 遅い順。時間が読めた分だけ。 */
  slowest: HarListItem[];
}

/** 値が無いときのキー。空文字と区別が付くよう文字で置く。 */
const NO_VALUE = 'なし';

function countBy(values: string[]): HarCount[] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((left, right) => {
      if (left.count !== right.count) return right.count - left.count;
      return left.key < right.key ? -1 : left.key > right.key ? 1 : 0;
    });
}

/** 「何件・いつからいつまで・どのステータス・どのホスト・どれが遅い」を先に出す。 */
export function summarizeHar(entries: HarEntry[], slowestCount: number): HarSummary {
  const times = entries
    .map((entry) => entry.startedDateTime)
    .filter((value): value is string => value !== null)
    .sort();
  const slowest = entries
    .filter((entry) => entry.time !== null)
    .sort((left, right) => (right.time ?? 0) - (left.time ?? 0))
    .slice(0, Math.max(0, slowestCount))
    .map(harListItem);
  const first = times[0];
  const last = times[times.length - 1];
  return {
    total: entries.length,
    timeRange:
      first === undefined || last === undefined ? null : { from: first, to: last },
    byStatus: countBy(
      entries.map((entry) => (entry.status === null ? NO_VALUE : String(entry.status))),
    ),
    byHost: countBy(entries.map((entry) => (entry.host === '' ? NO_VALUE : entry.host))),
    slowest,
  };
}

export interface HarBody {
  mimeType: string;
  size: number | null;
  /** 本文。求められたときだけ入る。 */
  text?: string;
  /** 長さの上限で切ったか。 */
  cut?: boolean;
  /** 要求の本文が名前と値の組で入っているとき。 */
  params?: Record<string, unknown>[];
}

export interface HarDetail {
  index: number;
  startedDateTime: string | null;
  time: number | null;
  timings: Record<string, unknown>;
  request: {
    method: string;
    url: string;
    httpVersion: string;
    headers: Record<string, unknown>[];
    queryString: Record<string, unknown>[];
    cookies: Record<string, unknown>[];
    postData?: HarBody;
  };
  response: {
    status: number | null;
    statusText: string;
    httpVersion: string;
    headers: Record<string, unknown>[];
    cookies: Record<string, unknown>[];
    content: HarBody;
  };
}

export interface DescribeHarEntryOptions {
  /** 本文を返すか（既定は返さない）。 */
  includeBody?: boolean;
  /** 本文の長さの上限。 */
  maxBodyLength?: number;
}

const MAX_BODY_LENGTH = 2000;

function toBody(source: Record<string, unknown>, options: DescribeHarEntryOptions): HarBody {
  const out: HarBody = { mimeType: asText(source['mimeType']), size: asNumber(source['size']) };
  if (options.includeBody !== true) return out;
  const text = asText(source['text']);
  if (text === '') return out;
  const limit = options.maxBodyLength ?? MAX_BODY_LENGTH;
  out.text = text.slice(0, limit);
  if (text.length > limit) out.cut = true;
  return out;
}

/**
 * 1 件の中身を出す。本文は既定で返さない。画像や JS が大半で、返しても調べる役に立たないうえ、
 * 読む側の文脈をそれだけで埋めてしまう。
 */
export function describeHarEntry(entry: HarEntry, options: DescribeHarEntryOptions): HarDetail {
  const request = asRecord(entry.raw['request']);
  const response = asRecord(entry.raw['response']);
  const postData = asRecord(request['postData']);
  const detail: HarDetail = {
    index: entry.index,
    startedDateTime: entry.startedDateTime,
    time: entry.time,
    timings: asRecord(entry.raw['timings']),
    request: {
      method: entry.method,
      url: entry.url,
      httpVersion: asText(request['httpVersion']),
      headers: asArray(request['headers']),
      queryString: asArray(request['queryString']),
      cookies: asArray(request['cookies']),
    },
    response: {
      status: entry.status,
      statusText: entry.statusText,
      httpVersion: asText(response['httpVersion']),
      headers: asArray(response['headers']),
      cookies: asArray(response['cookies']),
      content: toBody(asRecord(response['content']), options),
    },
  };
  if (Object.keys(postData).length > 0) {
    const body = toBody(postData, options);
    const params = asArray(postData['params']);
    // 名前と値の組は本文と違い、伏せ字が名前を見て効く。既定でも形だけは返す。
    if (params.length > 0) body.params = params;
    detail.request.postData = body;
  }
  return detail;
}
