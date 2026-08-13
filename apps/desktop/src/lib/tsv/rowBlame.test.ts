import { describe, expect, it } from 'vitest';
import { blameAge, formatBlameAge, parseRowBlame } from './rowBlame';

/** `git blame --line-porcelain` の出力（1 行 = ヘッダ + 属性 + タブ始まりの内容）。 */
function porcelain(
  entries: { sha: string; author: string; time: number; summary: string; content: string }[],
): string {
  return entries
    .map(({ sha, author, time, summary, content }, i) =>
      [
        `${sha} ${i + 1} ${i + 1} 1`,
        `author ${author}`,
        `author-mail <someone@example.com>`,
        `author-time ${time}`,
        `author-tz +0900`,
        `committer ${author}`,
        `committer-time ${time}`,
        `summary ${summary}`,
        `filename docs/test-specs/001-login.tsv`,
        `\t${content}`,
      ].join('\n'),
    )
    .join('\n');
}

const HEADER = '#! md-business:test-spec-tsv/v1';

describe('parseRowBlame', () => {
  it('行 ID をキーに、その行を最後に変えたコミットを返す', () => {
    const blame = parseRowBlame(
      porcelain([
        { sha: 'a'.repeat(40), author: '山田', time: 1754870400, summary: '起こす', content: HEADER },
        {
          sha: 'b'.repeat(40),
          author: '鈴木',
          time: 1754956800,
          summary: '手順を直す',
          content: '1\tログイン\tOK\tr0123456789ab',
        },
      ]),
    );

    expect(blame.get('r0123456789ab')).toEqual({
      commit: 'b'.repeat(40),
      author: '鈴木',
      timeMs: 1754956800_000,
      summary: '手順を直す',
      uncommitted: false,
    });
  });

  it('行 ID の無い行は載せない', () => {
    // マーカー行・ディレクティブ・ヘッダ行は表に出ていないので、指す先が無い。
    const blame = parseRowBlame(
      porcelain([
        { sha: 'a'.repeat(40), author: '山田', time: 1754870400, summary: '起こす', content: HEADER },
      ]),
    );

    expect(blame.size).toBe(0);
  });

  it('まだコミットしていない行は未コミットとして印す', () => {
    const blame = parseRowBlame(
      porcelain([
        {
          sha: '0'.repeat(40),
          author: 'Not Committed Yet',
          time: 1754956800,
          summary: 'Version of …',
          content: '2\t検索\t\tr00000000beef',
        },
      ]),
    );

    expect(blame.get('r00000000beef')?.uncommitted).toBe(true);
  });

  it('履歴が無ければ空', () => {
    expect(parseRowBlame('').size).toBe(0);
  });
});

describe('blameAge', () => {
  const now = Date.parse('2026-08-12T12:00:00Z');
  const age = (iso: string) => blameAge(Date.parse(iso), now);

  it('1 分未満は分の 0 として返す', () => {
    expect(age('2026-08-12T11:59:30Z')).toEqual({ value: 0, unit: 'minute' });
  });

  it('時・日・月・年へ繰り上げる', () => {
    expect(age('2026-08-12T09:00:00Z')).toEqual({ value: -3, unit: 'hour' });
    expect(age('2026-08-09T12:00:00Z')).toEqual({ value: -3, unit: 'day' });
    expect(age('2026-05-12T12:00:00Z')).toEqual({ value: -3, unit: 'month' });
    expect(age('2023-08-12T12:00:00Z')).toEqual({ value: -3, unit: 'year' });
  });

  it('未来の時刻は今として扱う', () => {
    // コミット時刻は別の PC の時計で付く。ずれていても「3 日後」とは出さない。
    expect(age('2026-08-20T12:00:00Z')).toEqual({ value: 0, unit: 'minute' });
  });
});

describe('formatBlameAge', () => {
  it('その言語の言い方で出す', () => {
    expect(formatBlameAge({ value: -3, unit: 'day' }, 'en')).toBe('3 days ago');
    expect(formatBlameAge({ value: -3, unit: 'day' }, 'ja')).toBe('3 日前');
  });
});
