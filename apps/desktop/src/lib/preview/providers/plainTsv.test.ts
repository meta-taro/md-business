import { describe, it, expect } from 'vitest';
import { renderPlainTsvPreview } from './plainTsv';
import { renderPreview } from '../renderPreview';

describe('宣言の無い .tsv の下見', () => {
  it('1 行目を見出しにして、タブで区切った表として描く', () => {
    const r = renderPlainTsvPreview('名前\t数量\r\nりんご\t3\r\nみかん\t\r\n', { fileName: 'stock.tsv' });
    expect(r.ok).toBe(true);
    expect(r.srcdoc).toContain('<th scope="col">名前</th><th scope="col">数量</th>');
    expect(r.srcdoc).toContain('<tr><td>りんご</td><td>3</td></tr>');
    expect(r.srcdoc).toContain('<tr><td>みかん</td><td></td></tr>');
    expect(r.documentTitle).toBe('stock.tsv');
  });

  it('列が足りない行は空のセルで埋め、多い行は見出しを足して全部出す', () => {
    const r = renderPlainTsvPreview('a\tb\n1\n2\t3\t4');
    expect(r.srcdoc).toContain('<tr><td>1</td><td></td><td></td></tr>');
    expect(r.srcdoc).toContain('<tr><td>2</td><td>3</td><td>4</td></tr>');
    expect(r.srcdoc).toContain('<th scope="col">a</th><th scope="col">b</th><th scope="col"></th>');
  });

  it('セルの中身はそのまま文字として出す（HTML として解釈しない）', () => {
    const r = renderPlainTsvPreview('h\n<script>x</script>');
    expect(r.srcdoc).toContain('&lt;script&gt;x&lt;/script&gt;');
    expect(r.srcdoc).not.toContain('<script>x</script>');
  });

  it('空のファイルは表を組まずにそう書く', () => {
    const r = renderPlainTsvPreview('');
    expect(r.srcdoc).toContain('中身がありません');
  });
});

describe('renderPreview の振り分け', () => {
  it('.tsv で宣言が無ければ素の表で描く（Markdown として読まない）', async () => {
    const r = await renderPreview('a\tb\n1\t2', { fileName: 'dir/x.TSV' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.label).toBe('TSV');
    expect(r.srcdoc).toContain('<td>1</td><td>2</td>');
  });
});
