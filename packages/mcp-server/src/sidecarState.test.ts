import { describe, expect, it } from 'vitest';
import {
  isReusableToken,
  parseSidecarState,
  resolveSidecarIdentity,
  serializeSidecarState,
} from './sidecarState.js';

const TOKEN = 'a'.repeat(64);

describe('isReusableToken', () => {
  it('64 桁の 16 進文字列を受け入れる', () => {
    expect(isReusableToken(TOKEN)).toBe(true);
  });

  it('長さ違い・16 進以外は受け入れない', () => {
    expect(isReusableToken('a'.repeat(63))).toBe(false);
    expect(isReusableToken('a'.repeat(65))).toBe(false);
    expect(isReusableToken('z'.repeat(64))).toBe(false);
    expect(isReusableToken('')).toBe(false);
  });
});

describe('parseSidecarState', () => {
  it('保存した内容をそのまま読み戻せる', () => {
    const text = serializeSidecarState({ token: TOKEN, port: 51234 });
    expect(parseSidecarState(text)).toEqual({ token: TOKEN, port: 51234 });
  });

  it('壊れた JSON は読めなかった扱いにする', () => {
    expect(parseSidecarState('{')).toBeNull();
    expect(parseSidecarState('')).toBeNull();
    expect(parseSidecarState('[]')).toBeNull();
  });

  it('形式に合わないトークンは捨てる', () => {
    expect(parseSidecarState(JSON.stringify({ token: 'short', port: 51234 }))).toBeNull();
  });

  it('ポートが範囲外・非整数なら 0（OS 割当）へ倒す', () => {
    // 特権ポートと 65535 超は使えない。トークンまで捨てる必要はない。
    expect(parseSidecarState(JSON.stringify({ token: TOKEN, port: 80 }))).toEqual({
      token: TOKEN,
      port: 0,
    });
    expect(parseSidecarState(JSON.stringify({ token: TOKEN, port: 70000 }))).toEqual({
      token: TOKEN,
      port: 0,
    });
    expect(parseSidecarState(JSON.stringify({ token: TOKEN, port: 1.5 }))).toEqual({
      token: TOKEN,
      port: 0,
    });
    expect(parseSidecarState(JSON.stringify({ token: TOKEN }))).toEqual({ token: TOKEN, port: 0 });
  });
});

describe('resolveSidecarIdentity', () => {
  const mint = (): string => 'b'.repeat(64);

  it('保存が無ければ発行し、書き戻す内容を返す', () => {
    const result = resolveSidecarIdentity(null, mint);
    expect(result).toEqual({ token: 'b'.repeat(64), port: 0, minted: true });
  });

  it('保存が読めれば作業対象を引き継ぐ（接続設定を作り直させない）', () => {
    const result = resolveSidecarIdentity({ token: TOKEN, port: 51234 }, mint);
    expect(result).toEqual({ token: TOKEN, port: 51234, minted: false });
  });
});
