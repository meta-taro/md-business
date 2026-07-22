import { describe, it, expect } from 'vitest';
import { parseUnifiedDiff, type DiffLine } from './diffParse';

const kinds = (lines: DiffLine[]): string[] => lines.map((l) => l.kind);
const texts = (lines: DiffLine[]): string[] => lines.map((l) => l.text);

describe('parseUnifiedDiff', () => {
  it('空文字列は空配列', () => {
    expect(parseUnifiedDiff('')).toEqual([]);
    expect(parseUnifiedDiff('   ')).toEqual([]);
  });

  it('ヘッダ行（diff / index / --- / +++）は meta に分類する', () => {
    const raw = [
      'diff --git a/a.md b/a.md',
      'index 111..222 100644',
      '--- a/a.md',
      '+++ b/a.md',
    ].join('\n');
    expect(kinds(parseUnifiedDiff(raw))).toEqual(['meta', 'meta', 'meta', 'meta']);
  });

  it('@@ 行は hunk に分類する', () => {
    expect(parseUnifiedDiff('@@ -1,3 +1,4 @@ fn foo')[0].kind).toBe('hunk');
  });

  it('追加行は add・削除行は del・文脈行は context', () => {
    const raw = [' 変わらない行', '-消えた行', '+増えた行'].join('\n');
    expect(kinds(parseUnifiedDiff(raw))).toEqual(['context', 'del', 'add']);
  });

  it('+++ / --- を + / - より先に判定する（ファイルヘッダを add/del にしない）', () => {
    const raw = ['--- a/x.md', '+++ b/x.md', '+実際の追加'].join('\n');
    expect(kinds(parseUnifiedDiff(raw))).toEqual(['meta', 'meta', 'add']);
  });

  it('「\\ No newline at end of file」は meta', () => {
    const raw = ['+末尾改行なし', '\\ No newline at end of file'].join('\n');
    expect(kinds(parseUnifiedDiff(raw))).toEqual(['add', 'meta']);
  });

  it('合成 untracked ヘッダ（new file:）は meta', () => {
    const raw = ['new file: notes.md', '@@ -0,0 +1,1 @@', '+新規行'].join('\n');
    expect(kinds(parseUnifiedDiff(raw))).toEqual(['meta', 'hunk', 'add']);
  });

  it('末尾の改行で余分な空行を作らない', () => {
    const raw = '+a\n+b\n';
    expect(texts(parseUnifiedDiff(raw))).toEqual(['+a', '+b']);
  });

  it('本文の空行は context として保持する（末尾以外）', () => {
    const raw = ['@@ -1,2 +1,2 @@', ' 行1', '', ' 行2'].join('\n');
    expect(kinds(parseUnifiedDiff(raw))).toEqual(['hunk', 'context', 'context', 'context']);
  });

  it('各行の text は元の行そのまま（prefix 記号を含む）', () => {
    const raw = ['+追加', '-削除'].join('\n');
    expect(texts(parseUnifiedDiff(raw))).toEqual(['+追加', '-削除']);
  });
});
