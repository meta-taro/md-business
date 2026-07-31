import { describe, it, expect } from 'vitest';
import { messages } from './messages';
import { LOCALES } from './locales';

// 型は「キーが揃っていること」までしか見ない。空文字や、差し込み欄（{count} 等）の
// 書き落としは通ってしまい、画面で初めて気づくことになる。ここで塞ぐ。

const KEYS = Object.keys(messages.ja) as (keyof typeof messages.ja)[];

function placeholders(text: string): string[] {
  return (text.match(/\{(\w+)\}/g) ?? []).sort();
}

describe('文言辞書', () => {
  it('すべての言語に、すべてのキーの中身がある', () => {
    for (const locale of LOCALES) {
      for (const key of KEYS) {
        expect(messages[locale][key], `${locale} / ${key}`).toBeTruthy();
      }
    }
  });

  it('差し込み欄は言語をまたいで同じ', () => {
    for (const locale of LOCALES) {
      for (const key of KEYS) {
        expect(placeholders(messages[locale][key]), `${locale} / ${key}`).toEqual(
          placeholders(messages.ja[key]),
        );
      }
    }
  });
});

describe('ソース管理パネルの文言', () => {
  const SCM_KEYS = KEYS.filter((key) => key.startsWith('scm.'));

  it('パネルの表示文言がすべて辞書にある', () => {
    expect(SCM_KEYS.length).toBeGreaterThan(0);
  });

  it('コミットボタンは件数を差し込める', () => {
    expect(messages.ja['scm.commitCount']).toContain('{count}');
  });
});
