import { describe, it, expect } from 'vitest';
import { emphasisWarnings } from '../src/emphasisWarnings.js';

describe('emphasisWarnings（強調にならずに刷られる記号）', () => {
  it('対の取れた強調・取り消し線は知らせない（全角の約物に接していても）', () => {
    expect(emphasisWarnings('**「重要」**です。~~「旧」~~の手順。\n')).toEqual([]);
  });

  it('日本語に接した __ は強調にならないので、** を勧める', () => {
    const out = emphasisWarnings('手順は__必ず__守る。\n');
    expect(out).toHaveLength(2);
    expect(out[0]).toContain('「__」');
    expect(out[0]).toContain('`**`');
  });

  it('閉じ忘れの ** を行番号付きで知らせる', () => {
    const out = emphasisWarnings('# 概要\n\n支払いは**月末に締める。\n');
    expect(out).toHaveLength(1);
    expect(out[0]).toContain('3 行目');
    expect(out[0]).toContain('「**」');
  });

  it('行番号は frontmatter を含めたファイルの行で数える', () => {
    const out = emphasisWarnings('---\ntitle: メモ\n---\n\n本文の~~消し忘れ。\n');
    expect(out[0]).toContain('5 行目');
    expect(out[0]).toContain('「~~」');
  });

  it('閉じる記号の直前に空白があれば、そう直し方を添える', () => {
    const out = emphasisWarnings('これは**重要 **です。\n');
    expect(out.join('\n')).toContain('空白');
  });

  it('コード・エスケープ・識別子の __ は知らせない', () => {
    const src = [
      '`a**b` と \\*\\* と __init__ と snake__case。',
      '',
      '```',
      '**閉じない',
      '```',
      '',
    ].join('\n');
    expect(emphasisWarnings(src)).toEqual([]);
  });

  it('改版の印（{~~前~>後~~}）は記号の残りとみなさない', () => {
    expect(emphasisWarnings('支払いは{~~月末~>翌月~~}に締める。{++追記++}\n')).toEqual([]);
  });

  it('多すぎるときは数をまとめて知らせる', () => {
    const src = Array.from({ length: 15 }, (_, k) => `行${k}**`).join('\n\n');
    const out = emphasisWarnings(src);
    expect(out.length).toBeLessThanOrEqual(11);
    expect(out[out.length - 1]).toContain('ほか');
  });
});
