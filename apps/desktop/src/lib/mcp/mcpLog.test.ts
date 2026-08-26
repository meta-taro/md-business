import { describe, it, expect } from 'vitest';
import {
  MCP_LOG_CAP,
  appendLog,
  parseLogEvent,
  formatLogTime,
  connectionText,
  indicatorText,
  fileChangeFromLog,
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

  it('created は在るときだけ載せる（新しく出来たのかを受け取る側が知るため）', () => {
    expect(
      parseLogEvent({ type: 'log', tool: 'write_site_file', ok: true, ts: 5, created: true }),
    ).toEqual({ tool: 'write_site_file', ok: true, ts: 5, created: true });
    expect(
      'created' in
        (parseLogEvent({ type: 'log', tool: 'write_site_file', ok: true, ts: 5, created: 'yes' }) ??
          {}),
    ).toBe(false);
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

const ready = (): McpStatus => ({
  state: 'ready',
  url: 'http://127.0.0.1:51234/mcp',
  port: 51234,
  token: 'a'.repeat(64),
  reason: null,
  detail: null,
});

describe('indicatorText', () => {
  it('状態ごとに短い文言と点の色を決める', () => {
    expect(indicatorText(ready())).toEqual({ key: 'status.mcpReady', tone: 'ok' });
    expect(indicatorText({ ...ready(), state: 'starting' })).toEqual({
      key: 'status.mcpStarting',
      tone: 'neutral',
    });
    expect(indicatorText({ ...ready(), state: 'unavailable' })).toEqual({
      key: 'status.mcpOff',
      tone: 'warn',
    });
  });

  it('文言キーは全ロケールに存在する', () => {
    const keys = (['ready', 'starting', 'unavailable'] as const).map(
      (state) => indicatorText({ ...ready(), state }).key,
    );
    for (const locale of LOCALES) {
      for (const key of keys) expect(messages[locale][key]).toBeTruthy();
    }
  });
});

describe('fileChangeFromLog', () => {
  const log = (over: Partial<McpLogEntry>): McpLogEntry => ({
    tool: 'read_document',
    ok: true,
    ts: 1,
    ...over,
  });

  it('作成はツリーの取り直しにする', () => {
    expect(fileChangeFromLog(log({ tool: 'create_document', path: 'specs/a.md' }))).toEqual({
      relPath: 'specs/a.md',
      kind: 'rescan',
      scope: 'tree',
    });
  });

  it('更新は中身の変更として扱う', () => {
    expect(fileChangeFromLog(log({ tool: 'update_document', path: 'specs/a.md' }))).toEqual({
      relPath: 'specs/a.md',
      kind: 'modified',
      scope: 'tree',
    });
  });

  it('検証シートへの行追加・行更新も中身の変更として扱う', () => {
    // TSV も書き込み系。ここを拾わないと、AI が書いた検証結果が開いたままの画面に出ない。
    expect(fileChangeFromLog(log({ tool: 'append_tsv_row', path: 'sheets/t.tsv' }))).toEqual({
      relPath: 'sheets/t.tsv',
      kind: 'modified',
      scope: 'tree',
    });
    expect(fileChangeFromLog(log({ tool: 'update_tsv_row', path: 'sheets/t.tsv' }))).toEqual({
      relPath: 'sheets/t.tsv',
      kind: 'modified',
      scope: 'tree',
    });
  });

  it('宣言を置いたら宣言そのものの変化として扱う', () => {
    // 監視が張れない環境でも、置かれた宣言に気づけるようにする。
    expect(
      fileChangeFromLog(log({ tool: 'declare_web_mode', path: 'md-business.yml' })),
    ).toEqual({
      relPath: 'md-business.yml',
      kind: 'modified',
      scope: 'config',
    });
  });

  it('サイトの部品を新しく作ったら走査し直す（一覧に出るように）', () => {
    expect(
      fileChangeFromLog(log({ tool: 'write_site_file', path: 'index.html', created: true })),
    ).toEqual({ relPath: 'index.html', kind: 'rescan', scope: 'site' });
  });

  it('元から在るサイトの部品への書き換えは、その 1 枚だけの変化として渡す', () => {
    // 一覧は変わらないので組み直さない。組み直すと、CSS を 1 行直すたびに
    // 本文から作るページまで作り直すことになる。
    expect(
      fileChangeFromLog(log({ tool: 'write_site_file', path: 'style.css', created: false })),
    ).toEqual({ relPath: 'style.css', kind: 'modified', scope: 'site' });
  });

  it('作ったかどうかが分からなければ走査し直す（取りこぼさない側へ倒す）', () => {
    expect(fileChangeFromLog(log({ tool: 'write_site_file', path: 'index.html' }))).toEqual({
      relPath: 'index.html',
      kind: 'rescan',
      scope: 'site',
    });
  });

  it('読み取り系・失敗・パス無しは変化として扱わない', () => {
    expect(fileChangeFromLog(log({ tool: 'read_document', path: 'a.md' }))).toBeNull();
    expect(fileChangeFromLog(log({ tool: 'read_tsv', path: 'sheets/t.tsv' }))).toBeNull();
    expect(fileChangeFromLog(log({ tool: 'search_documents' }))).toBeNull();
    expect(fileChangeFromLog(log({ tool: 'create_document', path: 'a.md', ok: false }))).toBeNull();
    expect(fileChangeFromLog(log({ tool: 'create_document' }))).toBeNull();
  });
});
