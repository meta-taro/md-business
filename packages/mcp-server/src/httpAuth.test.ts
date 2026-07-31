import { describe, it, expect } from 'vitest';
import { parseBearerToken, isAuthorized } from './httpAuth.js';

/**
 * HTTP モードの bearer トークン認証は純ロジックに切り出して単体テストする。
 * loopback bind + DNS リバインディング保護（トランスポート内蔵）に加えた最後の関門。
 */
describe('parseBearerToken', () => {
  it('`Bearer <token>` からトークンを取り出す', () => {
    expect(parseBearerToken('Bearer abc123')).toBe('abc123');
  });

  it('前後の空白を無視する', () => {
    expect(parseBearerToken('  Bearer abc123  ')).toBe('abc123');
  });

  it('ヘッダ欠如・スキーム不一致・空トークンは null', () => {
    expect(parseBearerToken(undefined)).toBeNull();
    expect(parseBearerToken('')).toBeNull();
    expect(parseBearerToken('Basic abc123')).toBeNull();
    expect(parseBearerToken('Bearer ')).toBeNull();
    expect(parseBearerToken('abc123')).toBeNull();
  });
});

describe('isAuthorized', () => {
  it('トークン一致で許可する', () => {
    expect(isAuthorized('Bearer secret-xyz', 'secret-xyz')).toBe(true);
  });

  it('不一致・欠如・空期待値は拒否する', () => {
    expect(isAuthorized('Bearer wrong', 'secret-xyz')).toBe(false);
    expect(isAuthorized(undefined, 'secret-xyz')).toBe(false);
    expect(isAuthorized('Bearer secret-xyz', '')).toBe(false);
  });

  // 定数時間比較は長さの違う入力を渡すと例外を投げる実装があるため、
  // 短い / 長い / マルチバイトのいずれでも「拒否を返す」ことを確かめる。
  it('長さの違うトークンは例外にせず拒否する', () => {
    expect(isAuthorized('Bearer s', 'secret-xyz')).toBe(false);
    expect(isAuthorized('Bearer secret-xyz-and-more', 'secret-xyz')).toBe(false);
    expect(isAuthorized('Bearer トークン', 'secret-xyz')).toBe(false);
  });
});
