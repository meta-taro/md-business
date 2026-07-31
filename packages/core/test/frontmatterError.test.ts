import { describe, it, expect } from 'vitest';
import { splitFrontmatter, FrontmatterError, describeFrontmatterError } from '../src/index.js';

/**
 * Frontmatter parse failures reach people who did not write the parser, so the
 * thrown error carries a stable `kind` plus the position **in the file** (the
 * YAML parser counts from the start of its own block, two lines later).
 * Callers turn the `kind` into a sentence in the reader's language.
 */

function catchError(source: string): unknown {
  try {
    splitFrontmatter(source);
    return null;
  } catch (error) {
    return error;
  }
}

describe('splitFrontmatter — 失敗の分類', () => {
  it('インデント崩れを indentation として投げる', () => {
    const error = catchError('---\nfoo: 1\n  bar: 2\n---\n');
    expect(error).toBeInstanceOf(FrontmatterError);
    if (error instanceof FrontmatterError) expect(error.kind).toBe('indentation');
  });

  it('タブ文字を tab として投げる', () => {
    const error = catchError('---\nfoo:\n\t- a\n---\n');
    expect(error).toBeInstanceOf(FrontmatterError);
    if (error instanceof FrontmatterError) expect(error.kind).toBe('tab');
  });

  it('キーの重複を duplicate-key として投げる', () => {
    const error = catchError('---\nfoo: 1\nfoo: 2\n---\n');
    expect(error).toBeInstanceOf(FrontmatterError);
    if (error instanceof FrontmatterError) expect(error.kind).toBe('duplicate-key');
  });

  it('閉じていない引用符・括弧を unterminated として投げる', () => {
    const quoted = catchError('---\nfoo: "abc\n---\n');
    expect(quoted).toBeInstanceOf(FrontmatterError);
    if (quoted instanceof FrontmatterError) expect(quoted.kind).toBe('unterminated');

    const flow = catchError('---\nfoo: [1, 2\n---\n');
    expect(flow).toBeInstanceOf(FrontmatterError);
    if (flow instanceof FrontmatterError) expect(flow.kind).toBe('unterminated');
  });

  it('`キー: 値` になっていない行を block-mapping として投げる', () => {
    const error = catchError('---\nfoo: 1\nplain text\nbar: 2\n---\n');
    expect(error).toBeInstanceOf(FrontmatterError);
    if (error instanceof FrontmatterError) expect(error.kind).toBe('block-mapping');
  });

  it('行番号はファイル先頭からの位置で返す（--- の行を含む）', () => {
    // 1 行目が ---、2 行目が foo、3 行目が壊れている行。
    const error = catchError('---\nfoo: 1\n  bar: 2\n---\n');
    expect(error).toBeInstanceOf(FrontmatterError);
    if (error instanceof FrontmatterError) {
      expect(error.line).toBe(3);
      // 桁は「パーサが読み進めて止まった位置」＝ `  bar:` のコロン（1 始まりで 6）。
      // 直すべき位置（行頭の余分な空白）とは限らないので、行番号ほどの意味は持たせない。
      expect(error.column).toBe(6);
    }
  });

  it('大きさ・アンカー数の上限は専用の kind で投げる', () => {
    const huge = `---\nfoo: ${'x'.repeat(300_000)}\n---\n`;
    const tooLarge = catchError(huge);
    expect(tooLarge).toBeInstanceOf(FrontmatterError);
    if (tooLarge instanceof FrontmatterError) expect(tooLarge.kind).toBe('too-large');

    const anchors = ['---', ...Array.from({ length: 9 }, (_, i) => `k${i}: &a${i} 1`), '---', ''];
    const tooMany = catchError(anchors.join('\n'));
    expect(tooMany).toBeInstanceOf(FrontmatterError);
    if (tooMany instanceof FrontmatterError) expect(tooMany.kind).toBe('too-many-anchors');
  });
});

describe('describeFrontmatterError', () => {
  it('FrontmatterError から kind と位置をそのまま取り出す', () => {
    const error = catchError('---\nfoo: 1\n  bar: 2\n---\n');
    const problem = describeFrontmatterError(error);
    expect(problem.kind).toBe('indentation');
    expect(problem.line).toBe(3);
  });

  it('見覚えのない値は unknown にし、元の文言を残す', () => {
    const problem = describeFrontmatterError(new Error('something else'));
    expect(problem.kind).toBe('unknown');
    expect(problem.raw).toBe('something else');
    expect(problem.line).toBeNull();
  });

  it('Error 以外も落とさずに扱う', () => {
    expect(describeFrontmatterError('文字列').kind).toBe('unknown');
    expect(describeFrontmatterError(undefined).raw).toBe('undefined');
  });
});
