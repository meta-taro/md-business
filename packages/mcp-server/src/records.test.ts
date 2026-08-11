import { describe, it, expect } from 'vitest';
import { MemoryDocumentStore } from './store.js';
import { filterRecords } from './records.js';

/**
 * 1 行 1 レコードのログを条件で絞る側の確認。見ているのは 3 つ。
 *
 * 1. **絞り込みは生の値に当て、伏せ字は返す直前にかける**。逆にすると
 *    「メールアドレスで絞る」ができなくなり、調査の道具として使えない
 * 2. **読めない行で止まらない**。現場のログには壊れた行が混ざる。落として黙るのでも、
 *    例外で全部を失うのでもなく、数えて返す
 * 3. **切ったときは切ったと返す**
 */

const jsonl = [
  '{"ts":"2026-08-11T05:00:00Z","level":"info","status":200,"user":{"id":7,"mail":"taro@example.com"}}',
  '{"ts":"2026-08-11T05:00:01Z","level":"error","status":500,"user":{"id":8}}',
  'これは JSON ではない',
  '{"ts":"2026-08-11T05:00:02Z","level":"error","status":503,"user":{"id":9}}',
].join('\n');

function store(): MemoryDocumentStore {
  return new MemoryDocumentStore({ 'logs/app.jsonl': jsonl });
}

describe('filterRecords（JSONL）', () => {
  it('等値で絞る', async () => {
    const r = await filterRecords(store(), {
      path: 'logs/app.jsonl',
      where: [{ field: 'level', op: 'eq', value: 'error' }],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.records).toHaveLength(2);
    expect(r.records[0]?.line).toBe(2);
  });

  it('入れ子の項目を `.` で指せる', async () => {
    const r = await filterRecords(store(), {
      path: 'logs/app.jsonl',
      where: [{ field: 'user.id', op: 'eq', value: '9' }],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.records).toHaveLength(1);
    expect(r.records[0]?.line).toBe(4);
  });

  it('数として読める両辺は数として比べる（文字列比較にしない）', async () => {
    const r = await filterRecords(store(), {
      path: 'logs/app.jsonl',
      where: [{ field: 'status', op: 'gte', value: '500' }],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // 文字列比較なら "200" >= "500" は偽で同じ結果になるため、桁の違う値で確かめる
    expect(r.records.map((x) => x.line)).toEqual([2, 4]);
  });

  it('数として読めない側があれば文字列として比べる', async () => {
    const r = await filterRecords(store(), {
      path: 'logs/app.jsonl',
      where: [{ field: 'level', op: 'gt', value: 'e' }],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.records.map((x) => x.line)).toEqual([1, 2, 4]);
  });

  it('部分一致と正規表現', async () => {
    const contains = await filterRecords(store(), {
      path: 'logs/app.jsonl',
      where: [{ field: 'ts', op: 'contains', value: '05:00:0' }],
    });
    expect(contains.ok && contains.records).toHaveLength(3);

    const matches = await filterRecords(store(), {
      path: 'logs/app.jsonl',
      where: [{ field: 'level', op: 'matches', value: '^err' }],
    });
    expect(matches.ok && matches.records).toHaveLength(2);
  });

  it('項目の有無で絞る', async () => {
    const missing = await filterRecords(store(), {
      path: 'logs/app.jsonl',
      where: [{ field: 'user.mail', op: 'missing' }],
    });
    expect(missing.ok && missing.records.map((x) => x.line)).toEqual([2, 4]);
  });

  it('条件が複数あるときは既定で全て満たす行だけを返す', async () => {
    const all = await filterRecords(store(), {
      path: 'logs/app.jsonl',
      where: [
        { field: 'level', op: 'eq', value: 'error' },
        { field: 'status', op: 'eq', value: '503' },
      ],
    });
    expect(all.ok && all.records.map((x) => x.line)).toEqual([4]);
  });

  it('match: any ならどれか 1 つでよい', async () => {
    const any = await filterRecords(store(), {
      path: 'logs/app.jsonl',
      match: 'any',
      where: [
        { field: 'status', op: 'eq', value: '200' },
        { field: 'status', op: 'eq', value: '503' },
      ],
    });
    expect(any.ok && any.records.map((x) => x.line)).toEqual([1, 4]);
  });

  it('条件を省いたら全件返す', async () => {
    const r = await filterRecords(store(), { path: 'logs/app.jsonl' });
    expect(r.ok && r.records).toHaveLength(3);
  });

  it('返す項目を絞れる（指定した項目が無い行は空の組になる）', async () => {
    const r = await filterRecords(store(), {
      path: 'logs/app.jsonl',
      fields: ['ts', 'user.id'],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.records[0]?.record).toEqual({ ts: '2026-08-11T05:00:00Z', 'user.id': 7 });
  });

  it('読めない行は落とさず数える（例外にしない）', async () => {
    const r = await filterRecords(store(), { path: 'logs/app.jsonl' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.skipped).toBe(1);
    expect(r.scannedLines).toBe(4);
  });

  it('上限に達したら切ったと返す', async () => {
    const r = await filterRecords(store(), { path: 'logs/app.jsonl', maxRecords: 1 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.records).toHaveLength(1);
    expect(r.truncated).toBe(true);
  });

  it('返す値には伏せ字がかかる', async () => {
    const r = await filterRecords(store(), { path: 'logs/app.jsonl' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(JSON.stringify(r.records)).not.toContain('taro@example.com');
    expect(r.masked.email).toBe(1);
  });

  it('絞り込みは伏せ字の**前**の値に当たる（伏せた値でも探せる）', async () => {
    const r = await filterRecords(store(), {
      path: 'logs/app.jsonl',
      where: [{ field: 'user.mail', op: 'eq', value: 'taro@example.com' }],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.records).toHaveLength(1);
    expect(JSON.stringify(r.records)).not.toContain('taro@example.com');
  });
});

describe('filterRecords（TSV）', () => {
  it('最初の見出し行を項目名として読む', async () => {
    const tsv = ['ts\tlevel\tmsg', '05:00:00\tinfo\tstarted', '05:00:01\terror\tfailed'].join('\n');
    const r = await filterRecords(new MemoryDocumentStore({ 'logs/a.tsv': tsv }), {
      path: 'logs/a.tsv',
      where: [{ field: 'level', op: 'eq', value: 'error' }],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.records[0]?.record).toEqual({ ts: '05:00:01', level: 'error', msg: 'failed' });
    expect(r.records[0]?.line).toBe(3);
  });

  it('検証シートは `#` 行を読み飛ばし、エスケープを戻す', async () => {
    const tsv = [
      '#! md-business:test-spec-tsv/v1',
      '# タイトル: 動作確認',
      'No.\t項目\t手順',
      '1\t表示\t開く\\n押す',
    ].join('\n');
    const r = await filterRecords(new MemoryDocumentStore({ 'docs/test-specs/001-a.tsv': tsv }), {
      path: 'docs/test-specs/001-a.tsv',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.records).toHaveLength(1);
    expect(r.records[0]?.record).toEqual({ 'No.': '1', 項目: '表示', 手順: '開く\n押す' });
  });

  it('見出しより列が多い行は余りを落とさずに拾う', async () => {
    const tsv = ['a\tb', '1\t2\t3'].join('\n');
    const r = await filterRecords(new MemoryDocumentStore({ 'logs/a.tsv': tsv }), {
      path: 'logs/a.tsv',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.records[0]?.record).toEqual({ a: '1', b: '2', 'column 3': '3' });
  });
});

describe('filterRecords の断り方', () => {
  it('ワークスペースの外は断る', async () => {
    const r = await filterRecords(store(), { path: '../secret.jsonl' });
    expect(r.ok).toBe(false);
  });

  it('形式が分からない拡張子は断る（推測で読まない）', async () => {
    const r = await filterRecords(new MemoryDocumentStore({ 'logs/app.log': 'x' }), {
      path: 'logs/app.log',
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain('format');
  });

  it('拡張子が分からなくても format を指定すれば読む', async () => {
    const r = await filterRecords(new MemoryDocumentStore({ 'logs/app.log': '{"a":1}' }), {
      path: 'logs/app.log',
      format: 'jsonl',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.records[0]?.record).toEqual({ a: 1 });
  });

  it('正規表現が壊れていれば断る', async () => {
    const r = await filterRecords(store(), {
      path: 'logs/app.jsonl',
      where: [{ field: 'level', op: 'matches', value: '(' }],
    });
    expect(r.ok).toBe(false);
  });

  it('値の要る条件で値が無ければ断る', async () => {
    const r = await filterRecords(store(), {
      path: 'logs/app.jsonl',
      where: [{ field: 'level', op: 'eq' }],
    });
    expect(r.ok).toBe(false);
  });

  it('ファイルが無ければ断る', async () => {
    const r = await filterRecords(store(), { path: 'logs/none.jsonl' });
    expect(r.ok).toBe(false);
  });
});
