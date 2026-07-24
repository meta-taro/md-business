import { describe, it, expect } from 'vitest';
import { resolveInitialLocale, interpolate, translate, type Dictionary } from './translate';

describe('resolveInitialLocale', () => {
  it('保存値が有効ロケールならそれを最優先する', () => {
    expect(resolveInitialLocale('ko', ['en-US'])).toBe('ko');
    expect(resolveInitialLocale('zh', [])).toBe('zh');
  });

  it('保存値が無効/未保存なら navigator の先頭候補を正規化して採用する', () => {
    expect(resolveInitialLocale(null, ['ja-JP', 'en'])).toBe('ja');
    expect(resolveInitialLocale(null, ['zh-Hans-CN'])).toBe('zh');
    expect(resolveInitialLocale('bogus', ['en-GB'])).toBe('en');
  });

  it('候補を先頭から見て最初に当たった対応ロケールを返す', () => {
    // fr は非対応なので飛ばして次の ko を拾う。
    expect(resolveInitialLocale(null, ['fr-FR', 'ko-KR'])).toBe('ko');
  });

  it('どれも当たらなければ fallback（既定 ja）を返す', () => {
    expect(resolveInitialLocale(null, ['fr', 'de'])).toBe('ja');
    expect(resolveInitialLocale(null, [], 'en')).toBe('en');
  });
});

describe('interpolate', () => {
  it('{name} を params で置換する', () => {
    expect(interpolate('{count} 件', { count: 3 })).toBe('3 件');
    expect(interpolate('Hi {who}', { who: 'there' })).toBe('Hi there');
  });

  it('params 無し / 対応値無しのプレースホルダは元のまま残す', () => {
    expect(interpolate('no ph')).toBe('no ph');
    expect(interpolate('{a}/{b}', { a: 1 })).toBe('1/{b}');
  });
});

describe('translate', () => {
  const en: Dictionary = { save: 'Save', 'match.count': '{cur}/{total}' };
  const ja: Dictionary = { save: '保存' };

  it('現ロケール辞書のキーを引く', () => {
    expect(translate(ja, en, 'save')).toBe('保存');
  });

  it('現ロケールに無いキーは fallback 辞書を見る', () => {
    // ja に match.count は無いので en（fallback）を引き、差し込む。
    expect(translate(ja, en, 'match.count', { cur: 2, total: 6 })).toBe('2/6');
  });

  it('どちらの辞書にも無いキーはキー文字列をそのまま返す（翻訳漏れの可視化）', () => {
    expect(translate(ja, en, 'unknown.key')).toBe('unknown.key');
  });
});
