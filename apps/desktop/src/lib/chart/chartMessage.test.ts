import { describe, expect, it } from 'vitest';
import { CHART_MESSAGE_KEYS, chartMessage } from './chartMessage';
import { messages } from '../i18n/messages';
import type { MessageKey } from '../i18n/messages';
import { LOCALES, type Locale } from '../i18n/locales';
import { translate, type Dictionary } from '../i18n/translate';

function translatorFor(locale: Locale) {
  return (key: MessageKey, params?: Record<string, string | number>): string =>
    translate(
      messages[locale] as unknown as Dictionary,
      messages.ja as unknown as Dictionary,
      key,
      params,
    );
}

const t = translatorFor('ja');

describe('描けない理由の文言', () => {
  it('種類ごとの説明を「図を描けません」に包む', () => {
    const text = chartMessage({ kind: 'no-column', raw: '売上', line: null }, t);
    expect(text).toContain('図を描けません');
    expect(text).toContain('売上');
  });

  it('行が分かれば行番号を添える', () => {
    const text = chartMessage({ kind: 'syntax', raw: 'あいうえお', line: 3 }, t);
    expect(text).toContain('3 行目');
  });

  it('描けたうえでの断りは「描けません」と言わない', () => {
    const text = chartMessage({ kind: 'unreadable-cells', raw: '2', line: null }, t);
    expect(text).not.toContain('描けません');
    expect(text).toContain('2');
  });

  it('どの言語にも文言がある', () => {
    for (const locale of LOCALES) {
      for (const key of Object.values(CHART_MESSAGE_KEYS)) {
        expect(messages[locale][key], `${locale}/${key}`).toBeTruthy();
      }
    }
  });
});
