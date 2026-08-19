import { describe, expect, it } from 'vitest';
import { describeHarEntry, filterHarEntries, parseHar, summarizeHar } from './har.js';
import type { HarEntry } from './har.js';
import { maskRecord, maskSecrets } from './maskSecrets.js';

/**
 * HAR は DevTools が「Save all as HAR」で吐く JSON。ここで確かめたいのは 3 つ。
 * 「概況が合うこと」「壊れた HAR を黙って空にしないこと」「秘密が生のまま出ないこと」。
 */

function entry(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    startedDateTime: '2026-08-11T10:00:00.000Z',
    time: 120,
    request: {
      method: 'GET',
      url: 'https://api.example.com/v1/items?page=1',
      httpVersion: 'HTTP/1.1',
      headers: [{ name: 'Accept', value: 'application/json' }],
      queryString: [{ name: 'page', value: '1' }],
      cookies: [],
    },
    response: {
      status: 200,
      statusText: 'OK',
      httpVersion: 'HTTP/1.1',
      headers: [{ name: 'Content-Type', value: 'application/json' }],
      cookies: [],
      content: { size: 30, mimeType: 'application/json', text: '{"items":[]}' },
    },
    timings: { wait: 100, receive: 20 },
    ...over,
  };
}

function har(entries: Record<string, unknown>[]): string {
  return JSON.stringify({ log: { version: '1.2', creator: { name: 'WebInspector' }, entries } });
}

const SECRET_ENTRY = entry({
  startedDateTime: '2026-08-11T10:05:00.000Z',
  time: 900,
  request: {
    method: 'POST',
    url: 'https://api.example.com/v1/login?token=abcdef123456',
    httpVersion: 'HTTP/1.1',
    headers: [
      { name: 'Authorization', value: 'Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig' },
      { name: 'Cookie', value: 'session=deadbeef; theme=dark' },
    ],
    queryString: [{ name: 'token', value: 'abcdef123456' }],
    cookies: [{ name: 'session', value: 'deadbeef' }],
    postData: {
      mimeType: 'application/x-www-form-urlencoded',
      text: 'user=taro%40example.com&password=hunter2',
      params: [
        { name: 'user', value: 'taro@example.com' },
        { name: 'password', value: 'hunter2' },
      ],
    },
  },
  response: {
    status: 500,
    statusText: 'Internal Server Error',
    httpVersion: 'HTTP/1.1',
    headers: [{ name: 'Set-Cookie', value: 'session=cafebabe; HttpOnly' }],
    cookies: [],
    content: { size: 21, mimeType: 'application/json', text: '{"error":"boom"}' },
  },
});

function parsed(text: string) {
  const result = parseHar(text);
  if (!result.ok) throw new Error(result.error);
  return result;
}

/** 添字で取れなければそこで落とす（無い相手に対する判定が素通りしないように）。 */
function at(entries: HarEntry[], index: number): HarEntry {
  const found = entries[index];
  if (found === undefined) throw new Error(`${index} 番がない`);
  return found;
}

describe('HAR を読む', () => {
  it('やり取りを 1 件ずつ取り出す', () => {
    const result = parsed(har([entry()]));
    expect(result.creator).toBe('WebInspector');
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({
      index: 0,
      method: 'GET',
      host: 'api.example.com',
      path: '/v1/items',
      status: 200,
      time: 120,
    });
  });

  it('HAR でなければ理由を言う', () => {
    expect(parseHar('{"foo":1}')).toEqual({ ok: false, error: expect.stringContaining('HAR') });
    expect(parseHar('これは JSON ではない')).toEqual({
      ok: false,
      error: expect.stringContaining('読めません'),
    });
  });

  it('欠けている項目があっても落ちない', () => {
    const result = parsed(har([{ request: { url: 'https://a.example.com/x' } }]));
    expect(at(result.entries, 0)).toMatchObject({ status: null, time: null, method: '' });
    expect(at(result.entries, 0).startedDateTime).toBeNull();
  });

  it('URL として読めなくても捨てない', () => {
    const result = parsed(har([{ request: { url: 'not a url' } }]));
    expect(at(result.entries, 0).host).toBe('');
    expect(at(result.entries, 0).url).toBe('not a url');
  });
});

describe('概況', () => {
  const entries = parsed(
    har([entry(), entry({ time: 40 }), SECRET_ENTRY, entry({ response: { status: 404 } })]),
  ).entries;

  it('件数と時間の範囲を出す', () => {
    const summary = summarizeHar(entries, 2);
    expect(summary.total).toBe(4);
    expect(summary.timeRange).toEqual({
      from: '2026-08-11T10:00:00.000Z',
      to: '2026-08-11T10:05:00.000Z',
    });
  });

  it('ステータス別とホスト別に数える', () => {
    const summary = summarizeHar(entries, 2);
    expect(summary.byStatus).toEqual([
      { key: '200', count: 2 },
      { key: '404', count: 1 },
      { key: '500', count: 1 },
    ]);
    expect(summary.byHost[0]).toEqual({ key: 'api.example.com', count: 4 });
  });

  it('遅い順に上から出す', () => {
    const summary = summarizeHar(entries, 2);
    expect(summary.slowest.map((item) => item.time)).toEqual([900, 120]);
  });

  it('空の HAR でも数を 0 で返す', () => {
    const summary = summarizeHar([], 5);
    expect(summary).toMatchObject({ total: 0, byStatus: [], slowest: [] });
    expect(summary.timeRange).toBeNull();
  });
});

describe('絞り込み', () => {
  const entries = parsed(har([entry(), SECRET_ENTRY, entry({ response: { status: 404 } })])).entries;

  it('ステータスの範囲で絞る', () => {
    expect(filterHarEntries(entries, { statusMin: 400 })).toHaveLength(2);
  });

  it('手立てと URL の一部で絞る', () => {
    expect(filterHarEntries(entries, { method: 'post' })).toHaveLength(1);
    expect(filterHarEntries(entries, { urlContains: '/login' })).toHaveLength(1);
  });

  it('時間帯で絞る', () => {
    expect(filterHarEntries(entries, { from: '2026-08-11T10:03:00Z' })).toHaveLength(1);
  });

  it('当てはまるものが無ければ空で返す', () => {
    expect(filterHarEntries(entries, { host: 'どこにも無い' })).toEqual([]);
  });
});

describe('1 件の詳しい中身', () => {
  const entries = parsed(har([SECRET_ENTRY])).entries;

  it('既定では本文を返さない', () => {
    const detail = describeHarEntry(at(entries, 0), {});
    expect(detail.response.content.text).toBeUndefined();
    expect(detail.response.content.size).toBe(21);
    expect(detail.request.headers).toHaveLength(2);
  });

  it('求められたときだけ本文を返し、長さで切る', () => {
    const detail = describeHarEntry(at(entries, 0), { includeBody: true, maxBodyLength: 5 });
    expect(detail.response.content.text).toHaveLength(5);
    expect(detail.response.content.cut).toBe(true);
  });
});

describe('秘密が生のまま出ない', () => {
  const detail = describeHarEntry(at(parsed(har([SECRET_ENTRY])).entries, 0), { includeBody: true });
  const masked = maskRecord(detail);
  const text = JSON.stringify(masked.value);

  it('見出しの名前が値の位置にいても伏せる', () => {
    expect(text).not.toContain('eyJhbGciOiJIUzI1NiJ9');
    expect(text).not.toContain('deadbeef');
    expect(text).not.toContain('cafebabe');
    expect(text).not.toContain('hunter2');
  });

  it('伏せたことを数で返す', () => {
    expect(masked.counts.authorization).toBeGreaterThan(0);
    expect(masked.counts.cookie).toBeGreaterThan(0);
  });

  it('調べるのに要る値は残す', () => {
    expect(text).toContain('/v1/login');
    expect(text).toContain('500');
  });

  it('行だけを見る伏せ字は HAR を素通りする', () => {
    // 名前が値の位置にいるので `名前: 値` の規則が 1 つも発火しない。
    // 構造を歩く側（maskRecord）を外すと漏れる、という目印。
    const raw = JSON.stringify(SECRET_ENTRY.request);
    expect(maskSecrets(raw).text).toContain('eyJhbGciOiJIUzI1NiJ9');
  });
});
