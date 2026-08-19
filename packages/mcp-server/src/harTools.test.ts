import { describe, expect, it } from 'vitest';
import { readHar } from './harTools.js';
import { MemoryDocumentStore } from './store.js';

function entry(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    startedDateTime: '2026-08-11T10:00:00.000Z',
    time: 120,
    request: {
      method: 'GET',
      url: 'https://api.example.com/v1/items?page=1',
      headers: [{ name: 'Accept', value: 'application/json' }],
      queryString: [{ name: 'page', value: '1' }],
      cookies: [],
    },
    response: {
      status: 200,
      statusText: 'OK',
      headers: [],
      cookies: [],
      content: { mimeType: 'application/json', size: 12, text: '{"items":[]}' },
    },
    ...over,
  };
}

const LOGIN = {
  startedDateTime: '2026-08-11T10:05:00.000Z',
  time: 900,
  request: {
    method: 'POST',
    url: 'https://api.example.com/v1/login',
    headers: [{ name: 'Authorization', value: 'Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig' }],
    queryString: [],
    cookies: [{ name: 'session', value: 'deadbeef' }],
    postData: { mimeType: 'application/x-www-form-urlencoded', text: 'password=hunter2' },
  },
  response: {
    status: 500,
    statusText: 'Internal Server Error',
    headers: [{ name: 'Set-Cookie', value: 'session=cafebabe; HttpOnly' }],
    cookies: [],
    content: { mimeType: 'application/json', size: 16, text: '{"error":"boom"}' },
  },
};

function har(entries: Record<string, unknown>[]): string {
  return JSON.stringify({
    log: { version: '1.2', creator: { name: 'WebInspector' }, entries },
  });
}

const PATH = 'investigations/通信.har';

function store(text: string): MemoryDocumentStore {
  return new MemoryDocumentStore({ [PATH]: text });
}

describe('HAR を読む', () => {
  it('概況と一覧を返す', async () => {
    const r = await readHar(store(har([entry(), LOGIN])), { path: PATH });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.path).toBe(PATH);
    expect(r.creator).toBe('WebInspector');
    expect(r.summary?.total).toBe(2);
    expect(r.entries.map((item) => item.status)).toEqual([200, 500]);
    // 一覧に本文は出さない（大半が画像や JS で、調べるのに要らない）。
    expect(JSON.stringify(r.entries)).not.toContain('"text"');
  });

  it('条件で絞ると概況も絞った分で出る', async () => {
    const r = await readHar(store(har([entry(), entry(), LOGIN])), { path: PATH, statusMin: 400 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.matched).toBe(1);
    expect(r.summary?.total).toBe(1);
    expect(r.entries[0]?.index).toBe(2);
  });

  it('件数の上限で切ったと返す', async () => {
    const r = await readHar(store(har([entry(), entry(), entry()])), { path: PATH, limit: 2 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.entries).toHaveLength(2);
    expect(r.matched).toBe(3);
    expect(r.truncated).toBe(true);
  });

  it('index を指すと 1 件の中身を返す', async () => {
    const r = await readHar(store(har([entry(), LOGIN])), { path: PATH, index: 1 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.entry?.request.method).toBe('POST');
    // 本文は求めない限り返さない。
    expect(r.entry?.response.content.text).toBeUndefined();
  });

  it('中身の秘密は伏せ字を通る', async () => {
    const r = await readHar(store(har([LOGIN])), { path: PATH, index: 0, includeBody: true });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const text = JSON.stringify(r.entry);
    expect(text).not.toContain('eyJhbGciOiJIUzI1NiJ9');
    expect(text).not.toContain('deadbeef');
    expect(text).not.toContain('cafebabe');
    expect(text).not.toContain('hunter2');
    expect(r.masked.authorization).toBeGreaterThan(0);
    // 調べるのに要る値は残る。
    expect(text).toContain('/v1/login');
    expect(text).toContain('500');
  });

  it('無い index は断る', async () => {
    const r = await readHar(store(har([entry()])), { path: PATH, index: 5 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain('5');
  });

  it('HAR でなければ理由を言う', async () => {
    const r = await readHar(store('{"foo":1}'), { path: PATH });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain('HAR');
  });

  it('ワークスペースの外は読まない', async () => {
    const r = await readHar(store(har([])), { path: '../外.har' });
    expect(r.ok).toBe(false);
  });

  it('無いファイルは断る', async () => {
    const r = await readHar(store(har([])), { path: 'investigations/無い.har' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain('見つかりません');
  });
});
