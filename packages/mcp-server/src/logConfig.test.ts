import { describe, expect, it } from 'vitest';
import { DEFAULT_LOG_CONFIG, parseLogConfig } from './logConfig';

describe('設定を読む', () => {
  it('設定ファイルが無ければ既定で動く', () => {
    const read = parseLogConfig(null);
    expect(read.config).toEqual(DEFAULT_LOG_CONFIG);
    expect(read.problem).toBeUndefined();
  });

  it('既定は残す・30 日・畳む（消すのは明示したときだけ）', () => {
    expect(DEFAULT_LOG_CONFIG).toEqual({ enabled: true, retentionDays: 30, onExpire: 'archive' });
  });

  it('書いてある分だけ差し替える', () => {
    const read = parseLogConfig('{"log":{"retentionDays":7}}');
    expect(read.config).toEqual({ enabled: true, retentionDays: 7, onExpire: 'archive' });
  });

  it('3 つとも指定できる', () => {
    const read = parseLogConfig('{"log":{"enabled":false,"retentionDays":1,"onExpire":"delete"}}');
    expect(read.config).toEqual({ enabled: false, retentionDays: 1, onExpire: 'delete' });
  });

  it('log の節が無ければ既定', () => {
    expect(parseLogConfig('{"other":1}').config).toEqual(DEFAULT_LOG_CONFIG);
  });
});

describe('壊れていても止めない', () => {
  it('JSON として読めなければ既定へ倒し、理由を返す', () => {
    const read = parseLogConfig('{壊れている');
    expect(read.config).toEqual(DEFAULT_LOG_CONFIG);
    expect(read.problem).toContain('config.json');
  });

  it('log が物でなければ既定へ倒す', () => {
    const read = parseLogConfig('{"log":"yes"}');
    expect(read.config).toEqual(DEFAULT_LOG_CONFIG);
    expect(read.problem).toBeDefined();
  });

  it('型の合わない項目だけ既定へ倒し、残りは活かす', () => {
    const read = parseLogConfig('{"log":{"enabled":"true","retentionDays":7}}');
    expect(read.config).toEqual({ enabled: true, retentionDays: 7, onExpire: 'archive' });
    expect(read.problem).toContain('enabled');
  });

  it('知らない畳み方は既定へ倒す', () => {
    const read = parseLogConfig('{"log":{"onExpire":"burn"}}');
    expect(read.config.onExpire).toBe('archive');
    expect(read.problem).toContain('onExpire');
  });

  it('日数が負・小数なら既定へ倒す', () => {
    expect(parseLogConfig('{"log":{"retentionDays":-1}}').config.retentionDays).toBe(30);
    expect(parseLogConfig('{"log":{"retentionDays":1.5}}').config.retentionDays).toBe(30);
  });

  it('0 日は指定として通す（その日のうちに畳む）', () => {
    expect(parseLogConfig('{"log":{"retentionDays":0}}').config.retentionDays).toBe(0);
  });
});
