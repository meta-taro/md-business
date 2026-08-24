import { describe, expect, it } from 'vitest';
import { sitePolicyFrom } from './sitePolicy';

describe('sitePolicyFrom', () => {
  it('宣言が無ければ何も動かさない', () => {
    expect(sitePolicyFrom('')).toEqual({ scripts: false, scriptOrigins: [] });
  });

  it('web モードの宣言で script を動かす側にする', () => {
    expect(sitePolicyFrom('mode: web\n')).toEqual({ scripts: true, scriptOrigins: [] });
  });

  it('宣言された置き先を持ち回る', () => {
    const source = 'mode: web\nweb:\n  scriptOrigins:\n    - https://example.com\n';
    expect(sitePolicyFrom(source)).toEqual({
      scripts: true,
      scriptOrigins: ['https://example.com'],
    });
  });

  // 読めない宣言を「web らしいから動かす」と汲み取らない。
  it('読めない宣言は動かさない側へ落ちる', () => {
    expect(sitePolicyFrom('mode: [web')).toEqual({ scripts: false, scriptOrigins: [] });
  });
});
