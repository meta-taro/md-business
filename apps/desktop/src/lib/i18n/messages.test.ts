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

// Node 未検出は、利用者が自分で直せる唯一の劣化理由。「入れてください」だけだと
// どの版を入れればいいか分からず、入れた後もアプリを起動し直さないと PATH が更新されず
// 同じ表示のままになる（実運用で発生した）。文言そのものは変わりうるので、
// 検査するのは「対処に必要な 2 点が載っていること」に絞る。
describe('Node 未検出の文言', () => {
  it('どの言語でも必要な版が分かる', () => {
    for (const locale of LOCALES) {
      expect(messages[locale]['mcp.reason.nodeMissing'], locale).toMatch(/\d+/);
    }
  });

  it('どの言語でも入れた後に起動し直すことが分かる', () => {
    const restart = /起動し直|再起動|重新启动|restart|다시 시작/i;
    for (const locale of LOCALES) {
      expect(messages[locale]['mcp.reason.nodeMissing'], locale).toMatch(restart);
    }
  });
});
