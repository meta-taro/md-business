import { describe, it, expect } from 'vitest';
import type { FrontmatterProblem, FrontmatterProblemKind } from '@md-business/core';
import { frontmatterMessage, FRONTMATTER_MESSAGE_KEYS } from './frontmatterMessage';
import { messages } from '../i18n/messages';
import { translate, type Dictionary } from '../i18n/translate';
import { LOCALES, type Locale } from '../i18n/locales';
import type { MessageKey } from '../i18n/messages';

function translatorFor(locale: Locale) {
  return (key: MessageKey, params?: Record<string, string | number>): string =>
    translate(
      messages[locale] as unknown as Dictionary,
      messages.ja as unknown as Dictionary,
      key,
      params,
    );
}

function problem(over: Partial<FrontmatterProblem> = {}): FrontmatterProblem {
  return { kind: 'indentation', line: 39, column: 2, raw: 'bad indentation', ...over };
}

describe('frontmatterMessage', () => {
  it('行番号と、その種類の説明を並べて返す', () => {
    const text = frontmatterMessage(problem(), translatorFor('ja'));
    expect(text).toContain('39');
    expect(text).toContain('行目');
    // パーサの英語（bad indentation）をそのまま出さない。
    expect(text).not.toContain('bad indentation');
  });

  it('位置が取れなかった場合は行番号を書かない', () => {
    const text = frontmatterMessage(problem({ line: null, column: null }), translatorFor('ja'));
    expect(text).not.toContain('行目');
    expect(text.length).toBeGreaterThan(0);
  });

  it('分類できなかったものは、パーサの原文を添えて返す', () => {
    const text = frontmatterMessage(
      problem({ kind: 'unknown', raw: 'something the parser said' }),
      translatorFor('ja'),
    );
    expect(text).toContain('something the parser said');
  });

  it('すべての種類に、すべての言語の文言がある', () => {
    const kinds = Object.keys(FRONTMATTER_MESSAGE_KEYS) as FrontmatterProblemKind[];
    for (const locale of LOCALES) {
      for (const kind of kinds) {
        const text = frontmatterMessage(problem({ kind }), translatorFor(locale));
        // 未定義キーは translate() がキー文字列をそのまま返す＝翻訳漏れの検出。
        expect(text).not.toContain(FRONTMATTER_MESSAGE_KEYS[kind]);
        expect(text).not.toContain('frontmatter.atLine');
        expect(text).not.toContain('frontmatter.failed');
      }
    }
  });
});
