import { describe, it, expect } from 'vitest';
import { compareSource, sourceToRender } from './compareSource';

const HEAD = '---\nschema: spec/v1\nversion: 1.1.0\n---\n';

describe('compareSource（前の版と比べた本文でプレビューを組む）', () => {
  it('frontmatter はいまの版のまま、本文だけに印を付ける', () => {
    const previous = '---\nschema: spec/v1\nversion: 1.0.0\n---\n\n支払いは月末に締める。\n';
    const current = `${HEAD}\n支払いは翌月 10 日に締める。\n`;
    expect(compareSource(previous, current)).toBe(
      `${HEAD}\n支払いは{~~月末~>翌月 10 日~~}に締める。\n`,
    );
  });

  it('frontmatter が変わっただけなら本文に印は付かない', () => {
    const previous = '---\nschema: spec/v1\nversion: 1.0.0\n---\n\n本文。\n';
    const current = `${HEAD}\n本文。\n`;
    expect(compareSource(previous, current)).toBe(current);
  });

  it('frontmatter の無い文書も比べられる', () => {
    expect(compareSource('一。\n', '二。\n')).toBe('{~~一~>二~~}。\n');
  });

  it('CRLF の版とも比べられる（改行の違いを変更にしない）', () => {
    const previous = '---\r\nschema: spec/v1\r\n---\r\n\r\n本文。\r\n';
    const current = '---\nschema: spec/v1\n---\n\n本文。\n';
    expect(compareSource(previous, current)).toBe(current);
  });
});

describe('sourceToRender（比べていないときは本文をそのまま描く）', () => {
  it('比べる版が無ければ、いまの本文を返す', () => {
    expect(sourceToRender('一。\n', null)).toBe('一。\n');
  });

  it('比べる版があれば、印を付けた本文を返す', () => {
    expect(sourceToRender('二。\n', '一。\n')).toBe('{~~一~>二~~}。\n');
  });
});
