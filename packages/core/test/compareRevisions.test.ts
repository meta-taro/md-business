import { describe, it, expect } from 'vitest';
import { acceptRevisions, compareRevisions, renderMarkdownToHtml } from '../src/index.js';

describe('compareRevisions（2 つの版を突き合わせて印を付ける）', () => {
  it('変わった所だけに印を付ける', () => {
    const marked = compareRevisions('支払いは月末に締める。\n', '支払いは翌月 10 日に締める。\n');
    expect(marked).toBe('支払いは{~~月末~>翌月 10 日~~}に締める。\n');
  });

  it('足した行・消した行を印にする', () => {
    const marked = compareRevisions('# 概要\n\n残る。\n\n消える。\n', '# 概要\n\n残る。\n\n足した。\n');
    expect(marked).toContain('残る。');
    expect(marked).toContain('{~~消える~>足した~~}');
    const only = compareRevisions('a\n', 'a\n\nb\n');
    expect(only).toBe('a\n\n{++b++}\n');
  });

  it('清書にすると新しい版に戻る', () => {
    const before = '# 概要\n\n- 一つ目\n- 二つ目\n\n本文の段落。\n';
    const after = '# 概要\n\n- 一つ目\n- 三つ目\n- 四つ目\n\n本文の別の段落。\n';
    expect(acceptRevisions(compareRevisions(before, after))).toBe(after);
  });

  it('見出しや箇条の記号は印の外に残す', () => {
    const marked = compareRevisions('## 旧い見出し\n\n- 旧い項目\n', '## 新しい見出し\n\n- 新しい項目\n');
    expect(marked).toMatch(/^## /);
    expect(marked).toContain('\n- ');
  });

  it('表は列を崩さず、変わったセルだけに印を付ける', () => {
    const before = '| 項目 | 値 |\n| --- | --- |\n| 締め日 | 月末 |\n';
    const after = '| 項目 | 値 |\n| --- | --- |\n| 締め日 | 翌月 10 日 |\n';
    const html = renderMarkdownToHtml(compareRevisions(before, after), { hasFrontmatter: false });
    expect(html).toContain('<td>締め日</td>');
    expect(html).toContain('<del class="mdb-del">月末</del>');
    expect(html).toContain('<ins class="mdb-ins">翌月 10 日</ins>');
  });

  it('強調などの記号をまたぐ変更は、段落ごと置き換えとして見せる（記号を片側だけ消さない）', () => {
    const marked = compareRevisions('これは**大事**です。\n', 'これは大事です。\n');
    expect(acceptRevisions(marked)).toBe('これは大事です。\n');
    const html = renderMarkdownToHtml(marked, { hasFrontmatter: false });
    expect(html).toContain('<strong>大事</strong>');
  });

  it('コードの中は印を付けず、新しい版をそのまま出す', () => {
    const before = '```\nold()\n```\n';
    const after = '```\nnew()\n```\n';
    expect(compareRevisions(before, after)).toBe(after);
  });

  it('どちらかに印が残っていたら、清書にしてから比べる', () => {
    const marked = compareRevisions('a{++b++}\n', 'ab\n');
    expect(marked).toBe('ab\n');
  });

  it('描くと変わった段落に縦線の目印が付く', () => {
    const html = renderMarkdownToHtml(compareRevisions('一。\n\n二。\n', '一。\n\n二です。\n'), {
      hasFrontmatter: false,
    });
    expect(html).toContain('mdb-changed');
    expect(html).toContain('<p>一。</p>');
  });
});
