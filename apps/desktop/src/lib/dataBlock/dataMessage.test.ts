import { describe, expect, it } from 'vitest';
import { DATA_MESSAGE_KEYS, dataMessage } from './dataMessage';
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

describe('表にできない理由の文言', () => {
  it('種類ごとの説明を「表にできません」に包む', () => {
    const text = dataMessage({ kind: 'read-failed', raw: 'data/売上.tsv', line: null }, t);
    expect(text).toContain('表にできません');
    expect(text).toContain('data/売上.tsv');
  });

  it('行が分かれば行番号を添える', () => {
    const text = dataMessage({ kind: 'syntax', raw: 'あいうえお', line: 2 }, t);
    expect(text).toContain('2 行目');
  });

  it('どの言語にも文言がある', () => {
    for (const locale of LOCALES) {
      for (const key of Object.values(DATA_MESSAGE_KEYS)) {
        expect(messages[locale][key], `${locale}/${key}`).toBeTruthy();
      }
    }
  });
});
