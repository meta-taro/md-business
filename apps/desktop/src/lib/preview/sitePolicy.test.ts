import { describe, expect, it } from 'vitest';
import { planStart, sitePolicyFrom } from './sitePolicy';

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

describe('planStart', () => {
  const closed = { scripts: false, scriptOrigins: [] };
  const open = { scripts: true, scriptOrigins: ['https://example.com'] };

  // 業務文書は script を求めていないので、尋ねる用事が無い。
  it('業務文書は同意を尋ねない', () => {
    expect(planStart(closed, false)).toEqual({ kind: 'go', policy: closed });
  });

  it('同意があればそのまま出す', () => {
    expect(planStart(open, true)).toEqual({ kind: 'go', policy: open });
  });

  // 動かない理由が画面に出ないと、宣言のほうを書き換えて回ることになる。
  it('同意が無ければ尋ねる', () => {
    expect(planStart(open, false)).toEqual({ kind: 'consent', policy: open });
  });
});
