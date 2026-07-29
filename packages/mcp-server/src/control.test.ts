import { describe, it, expect } from 'vitest';
import { parseControlLine, splitControlLines } from './control.js';

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
});
