import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { messages } from '../i18n/messages';
import { LOCALES } from '../i18n/locales';

/**
 * 更新のお知らせに出る文字が、表示言語に従うか。
 *
 * このダイアログは更新が無いときも開く（最新でも直近の変更履歴を出す）ので、
 * 日本語以外の利用者が最初に触る画面になりやすい。ここが日本語のままだと、
 * 言語を選べること自体が嘘になる。
 */

const source = readFileSync(
  fileURLToPath(new URL('./UpdateDialog.svelte', import.meta.url)),
  'utf8',
);

/** 注釈・スタイル・コードの読み仮名を落として、画面に出る部分だけ残す。 */
function visibleText(svelte: string): string {
  return svelte
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

const CJK = /[ぁ-んァ-ヶ一-龠]/;

describe('更新のお知らせの表示文字', () => {
  it('画面に出る所に、直に書いた日本語が残っていない', () => {
    const offending = visibleText(source)
      .split(/\r?\n/)
      .filter((line) => CJK.test(line));
    expect(offending).toEqual([]);
  });
});

describe('更新のお知らせの文言辞書', () => {
  const KEYS = Object.keys(messages.ja).filter((key) => key.startsWith('update.'));

  // 出る状態は 7 つ。1 つでも辞書に無いと、その状態のときだけ日本語に戻る。
  const STATES = [
    'checking',
    'upToDate',
    'available',
    'downloading',
    'installing',
    'ready',
    'error',
  ];

  it('状態ごとの見出しがすべてある', () => {
    for (const state of STATES) {
      expect(KEYS, state).toContain(`update.${state}Title`);
    }
  });

  it('版と進捗は文の中に差し込む', () => {
    // 「新しいバージョン v0.7.0 があります」の語順は言語ごとに違う。数字を文の外に
    // 置くと訳しようがなくなるため、差し込み欄として文の中へ入れる。
    expect(messages.ja['update.availableTitle']).toContain('{version}');
    expect(messages.ja['update.readyDesc']).toContain('{version}');
    expect(messages.ja['update.downloadingTitle']).toContain('{percent}');
  });

  it('どの言語でも、更新を今すぐ当てるか後にするかを選べる', () => {
    for (const locale of LOCALES) {
      expect(messages[locale]['update.installNow'], locale).toBeTruthy();
      expect(messages[locale]['update.later'], locale).toBeTruthy();
    }
  });
});
