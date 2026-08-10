import { describe, it, expect } from 'vitest';
import changelog from '../../../CHANGELOG.md?raw';
import tauriConf from '../../../src-tauri/tauri.conf.json?raw';
import {
  parseChangelog,
  recentReleases,
  RELEASE_HISTORY_LIMIT,
  RELEASES_URL,
} from './releaseHistory';

/**
 * 変更履歴の切り出し。
 *
 * 更新の口は「新しい版があるか」しか答えないので、最新のときはダイアログに出す材料が無い。
 * 出すものが無いと、更新のお知らせが正しく描けているかを確かめる機会も無くなる。
 * そこで配布物に同梱した変更履歴から直近の数件を切り出して常に見せる。
 */

const SAMPLE = [
  '# Changelog — @md-business/desktop',
  '',
  'このアプリの変更履歴。',
  '',
  '## 0.4.0',
  '',
  '### 追加',
  '',
  '- 四つ目',
  '',
  '## 0.3.0',
  '',
  '- 三つ目',
  '',
  '## 0.2.0',
  '',
  '- 二つ目',
  '',
  '## 0.1.0',
  '',
  '- 一つ目',
].join('\n');

describe('parseChangelog — 変更履歴を版ごとに切り出す', () => {
  it('新しい順に、版とその本文へ分ける', () => {
    const entries = parseChangelog(SAMPLE, 10);
    expect(entries.map((e) => e.version)).toEqual(['0.4.0', '0.3.0', '0.2.0', '0.1.0']);
    expect(entries[1]?.notes).toBe('- 三つ目');
  });

  it('版より前の前書きは、どの版の本文にも入れない', () => {
    const entries = parseChangelog(SAMPLE, 10);
    expect(entries.every((e) => !e.notes.includes('このアプリの変更履歴'))).toBe(true);
  });

  it('本文の中の見出しは、版の区切りとして読まない', () => {
    // `### 追加` まで版として拾うと、1 件が何本にも割れる。
    const entries = parseChangelog(SAMPLE, 10);
    expect(entries[0]?.notes).toContain('### 追加');
  });

  it('囲みの中に書いた見出しは、版の区切りとして読まない', () => {
    // 変更履歴に Markdown の例を載せることがある。字面だけで切ると、例が版になる。
    const fenced = [
      '## 1.0.0',
      '',
      '```md',
      '## これは例です',
      '```',
      '',
      '- 本文',
      '',
      '## 0.9.0',
      '',
      '- 前の版',
    ].join('\n');
    const entries = parseChangelog(fenced, 10);
    expect(entries.map((e) => e.version)).toEqual(['1.0.0', '0.9.0']);
    expect(entries[0]?.notes).toContain('## これは例です');
  });

  it('件数を絞ると、新しいほうから指定数だけ返す', () => {
    expect(parseChangelog(SAMPLE, 2).map((e) => e.version)).toEqual(['0.4.0', '0.3.0']);
  });

  it('版が 1 つも無ければ空を返す', () => {
    expect(parseChangelog('# Changelog\n\nまだ何もない。\n', 3)).toEqual([]);
  });
});

describe('recentReleases — 同梱した変更履歴', () => {
  it('直近の数件を、本文つきで返す', () => {
    const entries = recentReleases();
    expect(entries).toHaveLength(RELEASE_HISTORY_LIMIT);
    expect(entries.every((e) => /^\d+\.\d+\.\d+$/.test(e.version))).toBe(true);
    expect(entries.every((e) => e.notes.length > 0)).toBe(true);
  });

  it('先頭の版が、配布するアプリの版と一致する', () => {
    // ここがずれていると、使っている版より古い内容を「これまでの更新内容」として見せることになる。
    const version = (JSON.parse(tauriConf) as { version: string }).version;
    expect(recentReleases()[0]?.version).toBe(version);
    expect(parseChangelog(changelog, 1)[0]?.version).toBe(version);
  });

  it('続きの行き先は Release の一覧', () => {
    // 直近数件より前は、同梱物ではなく配信元を見てもらう。
    expect(RELEASES_URL).toMatch(/^https:\/\/github\.com\/.+\/releases$/);
  });
});
