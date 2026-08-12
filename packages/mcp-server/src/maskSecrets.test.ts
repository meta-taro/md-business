import { describe, it, expect } from 'vitest';
import { maskSecrets, maskRecord } from './maskSecrets.js';

/**
 * ログ・通信の抽出結果はそのままモデルへ渡る。ここで確かめるのは
 * 「秘密が生のまま残らないこと」と、その裏返しの「調べるのに要る値まで潰さないこと」。
 * 前者だけを追うと全部伏せ字にするのが最適解になり、調査に使えなくなる。
 */

describe('maskSecrets', () => {
  it('Authorization の値を残さない', () => {
    const r = maskSecrets('Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.abc');
    expect(r.text).not.toContain('eyJhbGciOiJIUzI1NiJ9');
    expect(r.text).toContain('***');
    expect(r.counts.authorization).toBe(1);
  });

  it('ヘッダ名の大文字小文字を問わない', () => {
    const r = maskSecrets('authorization: Basic dXNlcjpwYXNz');
    expect(r.text).not.toContain('dXNlcjpwYXNz');
  });

  it('Cookie は行末まで伏せる（複数の値が ; で並ぶため）', () => {
    const r = maskSecrets('Cookie: sid=abc123; pref=dark');
    expect(r.text).not.toContain('abc123');
    expect(r.text).not.toContain('dark');
    expect(r.counts.cookie).toBe(1);
  });

  it('Set-Cookie も同じく伏せる', () => {
    const r = maskSecrets('Set-Cookie: sid=xyz789; HttpOnly');
    expect(r.text).not.toContain('xyz789');
  });

  it('JSON の秘密キーだけを伏せ、隣の値は残す', () => {
    const r = maskSecrets('{"access_token":"tk_abc123","user":"taro"}');
    expect(r.text).not.toContain('tk_abc123');
    expect(r.text).toContain('taro');
    expect(r.counts.token).toBe(1);
  });

  it('クエリ文字列の api_key を伏せ、他のパラメータは残す', () => {
    const r = maskSecrets('GET /v1/items?api_key=KEY_abc123&page=2 HTTP/1.1');
    expect(r.text).not.toContain('KEY_abc123');
    expect(r.text).toContain('page=2');
    expect(r.counts.apiKey).toBe(1);
  });

  it('password / secret も同じ扱いにする', () => {
    const r = maskSecrets('password=p@ssw0rd client_secret=cs_live_abc');
    expect(r.text).not.toContain('p@ssw0rd');
    expect(r.text).not.toContain('cs_live_abc');
  });

  it('メールアドレスは局所部もドメインも残さない', () => {
    const r = maskSecrets('user taro.yamada+tag@example.co.jp signed in');
    expect(r.text).not.toContain('taro.yamada');
    expect(r.text).not.toContain('example.co.jp');
    expect(r.text).toContain('signed in');
    expect(r.counts.email).toBe(1);
  });

  it('カード番号らしい数字列は伏せる', () => {
    const r = maskSecrets('paid with 4242 4242 4242 4242');
    expect(r.text).not.toContain('4242 4242 4242 4242');
    expect(r.counts.cardNumber).toBe(1);
  });

  it('検査に通らない長い数字列は残す（trace id を潰さないため）', () => {
    const r = maskSecrets('trace_id 1234567890123456');
    expect(r.text).toContain('1234567890123456');
    expect(r.counts.cardNumber).toBeUndefined();
  });

  it('1 行 1 レコードの JSON では、引用符の中だけを伏せる', () => {
    const r = maskSecrets('{"authorization":"Bearer abc","path":"/orders","status":200}');
    expect(r.text).not.toContain('Bearer abc');
    expect(r.text).toContain('/orders');
    expect(r.text).toContain('200');
  });

  it('JSON の cookie も同じく引用符で止める', () => {
    const r = maskSecrets('{"cookie":"sid=abc; pref=dark","status":500}');
    expect(r.text).not.toContain('sid=abc');
    expect(r.text).toContain('500');
  });

  it('秘密が無ければ文字列は変わらない', () => {
    const src = '2026-08-11T05:00:00Z INFO order 1042 shipped';
    const r = maskSecrets(src);
    expect(r.text).toBe(src);
    expect(Object.keys(r.counts)).toHaveLength(0);
  });

  it('行の数を変えない（行番号で参照するため）', () => {
    const src = 'a\nAuthorization: Bearer abc\nCookie: x=1\nb';
    const r = maskSecrets(src);
    expect(r.text.split('\n')).toHaveLength(4);
    expect(r.text.split('\n')[3]).toBe('b');
  });

  it('同じ種別が複数あれば件数を数える', () => {
    const r = maskSecrets('a@example.com と b@example.com');
    expect(r.counts.email).toBe(2);
  });
});

/**
 * 行単位の規則は「名前がキーの位置にいて、その後ろに `:` か `=` が続く」形しか当たらない。
 * ところが調査で扱うデータには、名前が**値の位置**にいる形が普通に出てくる
 *（HAR のヘッダ配列 `{"name":"Authorization","value":"Bearer ..."}` が代表例）。
 * この形は行として読むと `"name":"Authorization",` で、名前の後ろは `,` なので規則が
 * 1 つも発火しない。構造として歩く側で塞ぐ。
 */
describe('maskRecord', () => {
  it('秘密の名前を持つキーの値を残さない', () => {
    const r = maskRecord({ authorization: 'Bearer eyJhbGciOi.abc', status: 200 });
    expect(JSON.stringify(r.value)).not.toContain('eyJhbGciOi');
    expect(JSON.stringify(r.value)).toContain('200');
    expect(r.counts.authorization).toBe(1);
  });

  it('名前が値の位置にいる組（name / value）でも伏せる', () => {
    const r = maskRecord({ name: 'Authorization', value: 'Bearer eyJhbGciOi.abc' });
    expect(JSON.stringify(r.value)).not.toContain('eyJhbGciOi');
    expect((r.value as { name: string }).name).toBe('Authorization');
    expect(r.counts.authorization).toBe(1);
  });

  it('入れ子の配列の中まで歩く', () => {
    const r = maskRecord({
      request: { headers: [{ name: 'Cookie', value: 'sid=abc123' }] },
    });
    expect(JSON.stringify(r.value)).not.toContain('abc123');
    expect(r.counts.cookie).toBe(1);
  });

  it('キーの名前で分かるものは種別を分ける', () => {
    const r = maskRecord({ api_key: 'ak_1', password: 'p@ss', access_token: 'tk_1' });
    expect(r.counts.apiKey).toBe(1);
    expect(r.counts.password).toBe(1);
    expect(r.counts.token).toBe(1);
  });

  it('秘密でないキーの文字列にも行の規則をかける（メール・カード番号）', () => {
    const r = maskRecord({ note: 'contact taro@example.com' });
    expect(JSON.stringify(r.value)).not.toContain('taro@example.com');
    expect(r.counts.email).toBe(1);
  });

  it('数値・真偽値・null は形を変えない', () => {
    const r = maskRecord({ status: 500, ok: false, next: null });
    expect(r.value).toEqual({ status: 500, ok: false, next: null });
    expect(Object.keys(r.counts)).toHaveLength(0);
  });

  it('元の値を書き換えない（呼び出し側が生データを持ち続けられるように）', () => {
    const src = { token: 'tk_abc' };
    maskRecord(src);
    expect(src.token).toBe('tk_abc');
  });

  it('深すぎる入れ子は打ち切る（壊れた入力で止まらないため）', () => {
    let deep: unknown = 'taro@example.com';
    for (let i = 0; i < 200; i += 1) deep = { nest: deep };
    expect(() => maskRecord(deep)).not.toThrow();
  });
});
