import { describe, expect, it } from 'vitest';
import { planWrite, planStart, sitePolicyFrom, webModeToggle } from './sitePolicy';

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

describe('planWrite', () => {
  const closed = { scripts: false, scriptOrigins: [] };
  const open = { scripts: true, scriptOrigins: ['https://example.com'] };

  // 業務文書はこれまでどおり本文の HTML を落として出す。
  it('業務文書は落としたまま書き出す', () => {
    expect(planWrite(closed, false)).toEqual({ kind: 'go', rawHtml: false });
  });

  // 見たものと出すものを揃える。ここが false のままだと CSS も JS も入らない dist が出る。
  it('宣言と同意が揃っていればそのまま書き出す', () => {
    expect(planWrite(open, true)).toEqual({ kind: 'go', rawHtml: true });
  });

  // 黙って落として書き出すと、開くまで壊れているとわからない成果物になる。
  it('同意が無ければ書き出さずに尋ねる', () => {
    expect(planWrite(open, false)).toEqual({ kind: 'consent', policy: open });
  });
});

describe('webModeToggle', () => {
  it('宣言の無いフォルダには置ける', () => {
    expect(webModeToggle('')).toBe('declare');
    expect(webModeToggle('\n  \n')).toBe('declare');
  });

  it('自分で書いた宣言は取り下げられる', () => {
    expect(webModeToggle('mode: web\n')).toBe('withdraw');
  });

  // 手で書いた宣言をアプリから崩さない。押せないことで先に見せる。
  it('ほかの設定がある宣言には手を出さない', () => {
    const written = 'mode: web\nweb:\n  scriptOrigins:\n    - https://example.com\n';
    expect(webModeToggle(written)).toBe('locked');
    expect(webModeToggle('mode: document\n')).toBe('locked');
  });
});
