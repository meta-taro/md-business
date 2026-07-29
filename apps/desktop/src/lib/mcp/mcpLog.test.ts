import { describe, it, expect } from 'vitest';
import {
  MCP_LOG_CAP,
  appendLog,
  parseLogEvent,
  formatLogTime,
  connectionText,
  reasonMessageKey,
  type McpLogEntry,
  type McpStatus,
} from './mcpLog';
import { messages } from '../i18n/messages';
import { LOCALES } from '../i18n/locales';

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

describe('connectionText', () => {
  const status = (over: Partial<McpStatus>): McpStatus => ({
    state: 'starting',
    url: null,
    port: null,
    token: null,
    reason: null,
    detail: null,
    ...over,
  });

  it('接続可能なら URL をそのまま出す（訳さない）', () => {
    const text = connectionText(status({ state: 'ready', url: 'http://127.0.0.1:5123/mcp' }));
    expect(text).toEqual({ kind: 'url', url: 'http://127.0.0.1:5123/mcp' });
  });

  it('接続可能でも URL が無ければ起動中に倒す', () => {
    expect(connectionText(status({ state: 'ready' }))).toEqual({ kind: 'key', key: 'mcp.starting' });
  });

  it('起動中は待機の文言キーを返す', () => {
    expect(connectionText(status({}))).toEqual({ kind: 'key', key: 'mcp.starting' });
  });

  it('劣化時は理由に対応する文言キーを返す', () => {
    expect(connectionText(status({ state: 'unavailable', reason: 'node-missing' }))).toEqual({
      kind: 'key',
      key: 'mcp.reason.nodeMissing',
    });
  });

  it('理由が無い劣化でも既定の文言キーを返す', () => {
    expect(connectionText(status({ state: 'unavailable' }))).toEqual({
      kind: 'key',
      key: 'mcp.reason.unknown',
    });
  });
});

describe('reasonMessageKey', () => {
  it('既知の理由コードを文言キーへ写す', () => {
    expect(reasonMessageKey('sidecar-missing')).toBe('mcp.reason.sidecarMissing');
    expect(reasonMessageKey('spawn-failed')).toBe('mcp.reason.spawnFailed');
    expect(reasonMessageKey('no-output')).toBe('mcp.reason.noOutput');
    expect(reasonMessageKey('exited-early')).toBe('mcp.reason.exitedEarly');
    expect(reasonMessageKey('server-error')).toBe('mcp.reason.serverError');
    expect(reasonMessageKey('status-unreadable')).toBe('mcp.reason.statusUnreadable');
  });

  it('知らない理由コードは未知の文言キーに倒す（サーバー側が先に進んでも壊さない）', () => {
    expect(reasonMessageKey('brand-new-reason')).toBe('mcp.reason.unknown');
    expect(reasonMessageKey(null)).toBe('mcp.reason.unknown');
  });

  it('写し先の文言キーは全ロケールに存在する', () => {
    const keys = [
      'sidecar-missing',
      'node-missing',
      'spawn-failed',
      'no-output',
      'exited-early',
      'server-error',
      'status-unreadable',
      null,
    ].map(reasonMessageKey);
    for (const locale of LOCALES) {
      for (const key of keys) expect(messages[locale][key]).toBeTruthy();
    }
  });
});
