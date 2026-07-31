import { describe, it, expect } from 'vitest';
import { encodeSidecarEvent, parseControlLine, splitControlLines } from './control.js';

/**
 * 制御チャネルは「親プロセス → 子プロセスの stdin」に流れる改行区切り JSON。
 * 相手は信頼できるが、パイプは途中で切れるしバージョンもずれる。ここでは壊れた
 * 入力で例外を投げず、必ず判定結果として返すことを固定する。
 */
describe('splitControlLines', () => {
  it('完結した行だけを返し、途中までの行は残りとして持ち越す', () => {
    const result = splitControlLines('{"a":1}\n{"b":2}\n{"c":');
    expect(result.lines).toEqual(['{"a":1}', '{"b":2}']);
    expect(result.rest).toBe('{"c":');
  });

  it('改行が来るまでは 1 行も返さない', () => {
    const result = splitControlLines('{"a":1}');
    expect(result.lines).toEqual([]);
    expect(result.rest).toBe('{"a":1}');
  });

  it('CRLF を行末として扱う', () => {
    const result = splitControlLines('{"a":1}\r\n{"b":2}\r\n');
    expect(result.lines).toEqual(['{"a":1}', '{"b":2}']);
    expect(result.rest).toBe('');
  });

  it('空入力は空の結果を返す', () => {
    expect(splitControlLines('')).toEqual({ lines: [], rest: '' });
  });
});

describe('parseControlLine', () => {
  it('set-root を受け付ける', () => {
    const result = parseControlLine('{"type":"set-root","root":"C:/work/docs"}');
    expect(result).toEqual({
      kind: 'command',
      command: { type: 'set-root', root: 'C:/work/docs' },
    });
  });

  it('空行・空白のみの行は無視する', () => {
    expect(parseControlLine('')).toEqual({ kind: 'ignored' });
    expect(parseControlLine('   \t ')).toEqual({ kind: 'ignored' });
  });

  it('JSON として壊れている行はエラーとして返す（例外にしない）', () => {
    const result = parseControlLine('{"type":');
    expect(result.kind).toBe('error');
  });

  it('オブジェクトでない JSON を拒否する', () => {
    expect(parseControlLine('42').kind).toBe('error');
    expect(parseControlLine('"set-root"').kind).toBe('error');
    expect(parseControlLine('null').kind).toBe('error');
    expect(parseControlLine('[{"type":"set-root","root":"/a"}]').kind).toBe('error');
  });

  it('未知の type を拒否する', () => {
    const result = parseControlLine('{"type":"shutdown"}');
    expect(result.kind).toBe('error');
    if (result.kind === 'error') expect(result.message).toContain('shutdown');
  });

  it('root が文字列でない set-root を拒否する', () => {
    expect(parseControlLine('{"type":"set-root"}').kind).toBe('error');
    expect(parseControlLine('{"type":"set-root","root":123}').kind).toBe('error');
  });

  it('root が空文字・空白のみの set-root を拒否する', () => {
    // 空 root を通すと store が意図せずカレントディレクトリを指してしまう。
    expect(parseControlLine('{"type":"set-root","root":""}').kind).toBe('error');
    expect(parseControlLine('{"type":"set-root","root":"  "}').kind).toBe('error');
  });

  it('root の前後空白を落とす', () => {
    const result = parseControlLine('{"type":"set-root","root":"  /work/docs  "}');
    expect(result).toEqual({
      kind: 'command',
      command: { type: 'set-root', root: '/work/docs' },
    });
  });

  it('アプリからの応答を受け取る', () => {
    const result = parseControlLine('{"type":"response","id":"r1","ok":true}');
    expect(result).toEqual({
      kind: 'command',
      command: { type: 'response', id: 'r1', ok: true },
    });
  });

  it('失敗の応答は理由を伴う', () => {
    const result = parseControlLine(
      '{"type":"response","id":"r1","ok":false,"error":"プレビューが未表示です"}',
    );
    expect(result).toEqual({
      kind: 'command',
      command: { type: 'response', id: 'r1', ok: false, error: 'プレビューが未表示です' },
    });
  });

  it('id の無い応答は拒否する', () => {
    // 宛先が分からない応答は、どの依頼を解決してよいか決められない。
    expect(parseControlLine('{"type":"response","ok":true}').kind).toBe('error');
    expect(parseControlLine('{"type":"response","id":"","ok":true}').kind).toBe('error');
  });

  it('ok が真偽値でない応答は拒否する', () => {
    expect(parseControlLine('{"type":"response","id":"r1","ok":"yes"}').kind).toBe('error');
  });
});

describe('encodeSidecarEvent', () => {
  it('ready を 1 行の JSON として書き出す', () => {
    const line = encodeSidecarEvent({
      type: 'ready',
      url: 'http://127.0.0.1:5123/mcp',
      port: 5123,
      token: 'abc',
      root: 'C:/work',
    });
    expect(line.endsWith('\n')).toBe(true);
    expect(JSON.parse(line)).toEqual({
      type: 'ready',
      url: 'http://127.0.0.1:5123/mcp',
      port: 5123,
      token: 'abc',
      root: 'C:/work',
    });
  });

  it('操作ログ entry をそのまま 1 行に載せる', () => {
    const line = encodeSidecarEvent({
      type: 'log',
      tool: 'create_document',
      ok: true,
      ts: 1_700_000_000_000,
      path: 'docs/a.md',
    });
    expect(JSON.parse(line)).toMatchObject({ type: 'log', tool: 'create_document', ok: true });
  });

  it('改行を含む値を埋め込んでも 1 行に収まる', () => {
    // 行区切りが本文の改行で割れると、受け手が JSON を組み立て直せなくなる。
    const line = encodeSidecarEvent({ type: 'error', message: '失敗\nしました' });
    expect(line.split('\n').filter((s) => s !== '')).toHaveLength(1);
    expect(JSON.parse(line).message).toBe('失敗\nしました');
  });

  it('root 差し替えの受理を返す', () => {
    const line = encodeSidecarEvent({ type: 'root', root: 'D:/docs' });
    expect(JSON.parse(line)).toEqual({ type: 'root', root: 'D:/docs' });
  });

  it('アプリへの依頼を id つきで送る', () => {
    const line = encodeSidecarEvent({
      type: 'request',
      id: 'r1',
      action: 'export-pdf',
      path: 'invoices/INV-1.md',
    });
    expect(JSON.parse(line)).toEqual({
      type: 'request',
      id: 'r1',
      action: 'export-pdf',
      path: 'invoices/INV-1.md',
    });
  });
});
