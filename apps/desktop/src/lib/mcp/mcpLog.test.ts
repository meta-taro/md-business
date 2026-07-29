import { describe, it, expect } from 'vitest';
import {
  MCP_LOG_CAP,
  appendLog,
  parseLogEvent,
  formatLogTime,
  connectionHint,
  type McpLogEntry,
  type McpStatus,
} from './mcpLog';

const entry = (ts: number): McpLogEntry => ({ tool: 'read_document', ok: true, ts });

describe('appendLog', () => {
  it('新しい実行を先頭に積む', () => {
    const list = appendLog(appendLog([], entry(1)), entry(2));
    expect(list.map((e) => e.ts)).toEqual([2, 1]);
  });

  it('元の配列を書き換えない', () => {
    const before: McpLogEntry[] = [entry(1)];
    appendLog(before, entry(2));
    expect(before).toHaveLength(1);
  });

  it('上限を超えたら古いものから捨てる', () => {
    let list: McpLogEntry[] = [];
    for (let i = 0; i < MCP_LOG_CAP + 10; i += 1) list = appendLog(list, entry(i));
    expect(list).toHaveLength(MCP_LOG_CAP);
    expect(list[0]?.ts).toBe(MCP_LOG_CAP + 9); // 最新
    expect(list.at(-1)?.ts).toBe(10); // 最古の 10 件は落ちている
  });

  it('上限は呼び出し側で狭められる', () => {
    const list = appendLog(appendLog(appendLog([], entry(1)), entry(2), 2), entry(3), 2);
    expect(list.map((e) => e.ts)).toEqual([3, 2]);
  });
});

describe('parseLogEvent', () => {
  it('必須項目が揃った log を受け取る', () => {
    expect(parseLogEvent({ type: 'log', tool: 'create_document', ok: false, ts: 5 })).toEqual({
      tool: 'create_document',
      ok: false,
      ts: 5,
    });
  });

  it('path と detail は在るときだけ載せる', () => {
    const parsed = parseLogEvent({
      type: 'log',
      tool: 'update_document',
      ok: false,
      ts: 5,
      path: 'docs/a.md',
      detail: 'スキーマ違反',
    });
    expect(parsed).toEqual({
      tool: 'update_document',
      ok: false,
      ts: 5,
      path: 'docs/a.md',
      detail: 'スキーマ違反',
    });
  });

  it('読めない形は捨てる', () => {
    // サーバー側の版が進んで未知の形が届いても、画面を壊さず無視する。
    expect(parseLogEvent(null)).toBeNull();
    expect(parseLogEvent('log')).toBeNull();
    expect(parseLogEvent({ type: 'ready' })).toBeNull();
    expect(parseLogEvent({ type: 'log', ok: true, ts: 1 })).toBeNull();
    expect(parseLogEvent({ type: 'log', tool: 'x', ok: 'yes', ts: 1 })).toBeNull();
    expect(parseLogEvent({ type: 'log', tool: 'x', ok: true, ts: '1' })).toBeNull();
  });

  it('型の合わない補足項目は落として本体は残す', () => {
    expect(parseLogEvent({ type: 'log', tool: 'x', ok: true, ts: 1, path: 3 })).toEqual({
      tool: 'x',
      ok: true,
      ts: 1,
    });
  });
});

describe('formatLogTime', () => {
  it('時刻を時分秒で表す', () => {
    const ts = new Date(2026, 6, 26, 9, 5, 3).getTime();
    expect(formatLogTime(ts)).toBe('09:05:03');
  });
});

describe('connectionHint', () => {
  const status = (over: Partial<McpStatus>): McpStatus => ({
    state: 'starting',
    url: null,
    port: null,
    token: null,
    detail: null,
    ...over,
  });

  it('接続可能なら URL を出す', () => {
    const hint = connectionHint(status({ state: 'ready', url: 'http://127.0.0.1:5123/mcp' }));
    expect(hint).toBe('http://127.0.0.1:5123/mcp');
  });

  it('起動中は待機中と伝える', () => {
    expect(connectionHint(status({}))).toBe('起動中…');
  });

  it('劣化時は理由をそのまま出す', () => {
    expect(connectionHint(status({ state: 'unavailable', detail: 'Node が見つかりません' }))).toBe(
      'Node が見つかりません',
    );
  });

  it('理由が無い劣化でも既定の文言を返す', () => {
    expect(connectionHint(status({ state: 'unavailable' }))).toBe('利用できません');
  });
});
