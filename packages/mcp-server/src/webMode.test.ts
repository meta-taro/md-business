import { describe, it, expect } from 'vitest';
import { describeWebMode, parseTrustAnswer } from './webMode.js';

const trusted = { path: 'C:\work\site', trusted: true };
const untrusted = { path: 'C:\work\site', trusted: false };

describe('describeWebMode', () => {
  it('宣言が無いフォルダは document モードで、script は動かない', () => {
    const status = describeWebMode('', untrusted);
    expect(status.state).toBe('document');
    expect(status.mode).toBe('document');
    expect(status.scriptOrigins).toEqual([]);
  });

  it('web モードが宣言されていても、未同意なら同意待ちとして返る', () => {
    // 失敗として返すと、依頼元は「このフォルダでは無理だ」と諦めてしまう。
    // 人がアプリで 1 回押せば通る状態であることが伝わる必要がある。
    const status = describeWebMode('mode: web\n', untrusted);
    expect(status.state).toBe('awaiting-consent');
    expect(status.mode).toBe('web');
    expect(status.trusted).toBe(false);
  });

  it('同意待ちのときも、何が宣言されているかを添える', () => {
    const status = describeWebMode(
      'mode: web\nweb:\n  scriptOrigins:\n    - https://cdn.example.com\n',
      untrusted,
    );
    expect(status.state).toBe('awaiting-consent');
    expect(status.scriptOrigins).toEqual(['https://cdn.example.com']);
  });

  it('宣言と同意が揃って初めて動く状態になる', () => {
    const status = describeWebMode('mode: web\n', trusted);
    expect(status.state).toBe('ready');
    expect(status.trusted).toBe(true);
  });

  it('同意があっても、宣言が document なら script は動かない', () => {
    // 許可はフォルダに与えたもので、モードを引き上げる力は持たない。
    const status = describeWebMode('mode: document\n', trusted);
    expect(status.state).toBe('document');
    expect(status.trusted).toBe(true);
  });

  it('読めない宣言は document 扱いにして、理由を添える', () => {
    const status = describeWebMode('mode: [web\n', untrusted);
    expect(status.state).toBe('document');
    expect(status.problems.length).toBeGreaterThan(0);
  });

  it('どの状態でも、次に何をすればよいかを言葉で返す', () => {
    for (const status of [
      describeWebMode('', untrusted),
      describeWebMode('mode: web\n', untrusted),
      describeWebMode('mode: web\n', trusted),
    ]) {
      expect(status.summary).not.toBe('');
    }
  });
});

describe('parseTrustAnswer', () => {
  it('アプリの答えを読み取る', () => {
    expect(
      parseTrustAnswer({ path: 'C:\work\site', key: 'c:\work\site', trusted: true, grantedAt: 1 }),
    ).toEqual({ path: 'C:\work\site', trusted: true });
  });

  it('読めない形は null（許してあるとは答えない）', () => {
    // 分からないことを「許可済み」に寄せると、押していない許可で script が動く。
    expect(parseTrustAnswer(null)).toBeNull();
    expect(parseTrustAnswer({ path: 'C:\work\site' })).toBeNull();
    expect(parseTrustAnswer({ trusted: true })).toBeNull();
    expect(parseTrustAnswer({ path: 1, trusted: true })).toBeNull();
    expect(parseTrustAnswer({ path: 'x', trusted: 'yes' })).toBeNull();
  });
});
