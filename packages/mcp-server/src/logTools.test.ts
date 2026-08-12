import { describe, it, expect } from 'vitest';
import { MemoryDocumentStore } from './store.js';
import { searchLines, readLines } from './logTools.js';

/**
 * ログ調査ツールの契約。見るのは 3 つ。
 * 1. 求めた行が求めた形（行番号つき）で返ること
 * 2. **返す量に上限があり、切ったときは切ったと返すこと**。黙って切ると、
 *    受け取った AI は全部見た前提で結論を出す
 * 3. 返す文字列に秘密が生のまま残らないこと（ここを通らない経路を作らない）
 */

const LOG = [
  '2026-08-11T05:00:00Z INFO  order 1042 created',
  '2026-08-11T05:00:01Z DEBUG Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.secret',
  '2026-08-11T05:00:02Z ERROR payment failed for order 1042',
  '2026-08-11T05:00:03Z INFO  retry scheduled',
  '2026-08-11T05:00:04Z ERROR payment failed for order 1043',
].join('\n');

function store(files: Record<string, string> = { 'app.log': LOG }): MemoryDocumentStore {
  return new MemoryDocumentStore(files);
}

describe('searchLines', () => {
  it('一致した行を行番号つきで返す', async () => {
    const r = await searchLines(store(), { path: 'app.log', pattern: 'ERROR' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.matches.map((m) => m.line)).toEqual([3, 5]);
    expect(r.matches[0]?.text).toContain('payment failed for order 1042');
  });

  it('前後の行を指定した数だけ付ける（端では足りるだけ返す）', async () => {
    const r = await searchLines(store(), { path: 'app.log', pattern: 'order 1043', after: 2 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.matches[0]?.before).toEqual([]);
    expect(r.matches[0]?.after).toEqual([]);
  });

  it('前の行を求めれば直前から順に返す', async () => {
    const r = await searchLines(store(), { path: 'app.log', pattern: 'retry', before: 2 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.matches[0]?.before).toEqual([
      '2026-08-11T05:00:01Z DEBUG Authorization: ***',
      '2026-08-11T05:00:02Z ERROR payment failed for order 1042',
    ]);
  });

  it('大文字小文字を無視できる', async () => {
    const r = await searchLines(store(), { path: 'app.log', pattern: 'error', ignoreCase: true });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.matches).toHaveLength(2);
  });

  it('一致が上限を超えたら打ち切り、打ち切ったことを返す', async () => {
    const r = await searchLines(store(), { path: 'app.log', pattern: 'INFO', maxMatches: 1 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.matches).toHaveLength(1);
    expect(r.truncated).toBe(true);
  });

  it('上限に達しなければ打ち切っていないと返す', async () => {
    const r = await searchLines(store(), { path: 'app.log', pattern: 'ERROR' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.truncated).toBe(false);
  });

  it('一致した行の秘密は伏せる', async () => {
    const r = await searchLines(store(), { path: 'app.log', pattern: 'Authorization' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.matches[0]?.text).not.toContain('eyJhbGciOiJIUzI1NiJ9');
    expect(r.masked.authorization).toBe(1);
  });

  it('長すぎる行は切って、切った行数を返す', async () => {
    const long = `head ${'x'.repeat(5000)} tail`;
    const r = await searchLines(store({ 'big.log': long }), {
      path: 'big.log',
      pattern: 'head',
      maxLineLength: 100,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.matches[0]?.text).toHaveLength(100);
    expect(r.truncatedLines).toBe(1);
  });

  it('一致が無ければ空で返す（失敗にしない）', async () => {
    const r = await searchLines(store(), { path: 'app.log', pattern: 'not-found' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.matches).toEqual([]);
    expect(r.truncated).toBe(false);
  });

  it('走査した行数を返す', async () => {
    const r = await searchLines(store(), { path: 'app.log', pattern: 'ERROR' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.scannedLines).toBe(5);
  });

  it('壊れた正規表現は理由つきで失敗する', async () => {
    const r = await searchLines(store(), { path: 'app.log', pattern: '(' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain('正規表現');
  });

  it('ワークスペース外のパスは拒否する', async () => {
    const r = await searchLines(store(), { path: '../secret.log', pattern: 'a' });
    expect(r.ok).toBe(false);
  });

  it('ファイルが無ければ理由つきで失敗する', async () => {
    const r = await searchLines(store(), { path: 'missing.log', pattern: 'a' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain('見つかりません');
  });
});

describe('readLines', () => {
  it('指定した行範囲を行番号つきで返す', async () => {
    const r = await readLines(store(), { path: 'app.log', from: 3, to: 4 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.from).toBe(3);
    expect(r.lines.map((l) => l.line)).toEqual([3, 4]);
    expect(r.lines[1]?.text).toContain('retry scheduled');
  });

  it('ファイル末尾を超える範囲でも、あるところまで返す', async () => {
    const r = await readLines(store(), { path: 'app.log', from: 4, to: 99 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.lines).toHaveLength(2);
    expect(r.truncated).toBe(false);
  });

  it('上限を超える範囲は切って、切ったことを返す', async () => {
    const r = await readLines(store(), { path: 'app.log', from: 1, to: 5, maxLines: 2 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.lines).toHaveLength(2);
    expect(r.truncated).toBe(true);
  });

  it('秘密は伏せる', async () => {
    const r = await readLines(store(), { path: 'app.log', from: 2, to: 2 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.lines[0]?.text).not.toContain('eyJhbGciOiJIUzI1NiJ9');
    expect(r.masked.authorization).toBe(1);
  });

  it('1 行目より前や、逆向きの範囲は拒否する', async () => {
    expect((await readLines(store(), { path: 'app.log', from: 0, to: 3 })).ok).toBe(false);
    expect((await readLines(store(), { path: 'app.log', from: 4, to: 2 })).ok).toBe(false);
  });

  it('ファイルが無ければ理由つきで失敗する', async () => {
    const r = await readLines(store(), { path: 'missing.log', from: 1, to: 2 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain('見つかりません');
  });
});
