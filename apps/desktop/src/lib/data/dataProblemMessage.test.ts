import { describe, it, expect } from 'vitest';
import type { DataProblem } from '@md-business/data-tree';
import { DATA_PROBLEM_MESSAGE_KEYS, dataProblemMessage } from './dataProblemMessage';
import { messages, type MessageKey } from '../i18n/messages';
import { translate, type Dictionary } from '../i18n/translate';
import { LOCALES, type Locale } from '../i18n/locales';

function translatorFor(locale: Locale) {
  return (key: MessageKey, params?: Record<string, string | number>): string =>
    translate(
      messages[locale] as unknown as Dictionary,
      messages.ja as unknown as Dictionary,
      key,
      params,
    );
}

const ja = translatorFor('ja');

describe('開けない理由の文', () => {
  it('種類ごとの説明を出す', () => {
    const problem: DataProblem = { kind: 'entity', message: 'raw English' };
    expect(dataProblemMessage(problem, ja)).toContain(messages.ja['data.entity']);
  });

  it('行が分かるときは行番号を添える', () => {
    const problem: DataProblem = { kind: 'syntax', message: 'raw', line: 12 };
    expect(dataProblemMessage(problem, ja)).toContain('12');
  });

  it('行が無いときは行番号を作らない', () => {
    const problem: DataProblem = { kind: 'syntax', message: 'raw' };
    expect(dataProblemMessage(problem, ja)).not.toMatch(/\d/);
  });

  it('読み手の言語で出す（読み取り側の英語の文をそのまま出さない）', () => {
    const problem: DataProblem = { kind: 'doctype', message: 'This file carries a DTD.' };
    expect(dataProblemMessage(problem, ja)).not.toContain('This file carries');
  });

  it('種類はすべて文言を持つ（どの言語でも）', () => {
    for (const key of Object.values(DATA_PROBLEM_MESSAGE_KEYS)) {
      for (const locale of LOCALES) {
        expect(messages[locale][key], `${locale} / ${key}`).toBeTruthy();
      }
    }
  });
});
