import { describe, it, expect } from 'vitest';
import { toDataScript, toMarkdownTable } from './dataTable';

const TABLE = { columns: ['月', '売上'], rows: [['1月', '120'], ['2月', '']] };

describe('Markdown の表にする', () => {
  it('見出し・区切り・行の順に組む', () => {
    expect(toMarkdownTable(TABLE)).toBe(
      '| 月 | 売上 |\n| --- | --- |\n| 1月 | 120 |\n| 2月 |  |',
    );
  });

  it('`|` は退避する（そのまま置くと列がずれる）', () => {
    const out = toMarkdownTable({ columns: ['名前'], rows: [['A|B']] });
    expect(out).toContain('| A\\|B |');
  });

  it('改行とタブは空白へ畳む（表の 1 行が割れるため）', () => {
    const out = toMarkdownTable({ columns: ['備考'], rows: [['上\n下']] });
    expect(out).toContain('| 上 下 |');
  });

  it('空欄は空欄のまま（0 や N/A で埋めない）', () => {
    expect(toMarkdownTable(TABLE)).toContain('| 2月 |  |');
  });
});

describe('中身をそのまま渡す囲みを添える', () => {
  it('列名を鍵に、1 行を 1 件として並べる', () => {
    const out = toDataScript(TABLE, 'data/売上.tsv');
    expect(out).toContain('"月":"1月"');
    expect(out).toContain('"売上":"120"');
  });

  it('空欄は null（空文字と混ぜない）', () => {
    expect(toDataScript(TABLE, 'a.tsv')).toContain('"売上":null');
  });

  it('`<` は逃がす（囲みを途中で閉じさせない）', () => {
    const out = toDataScript({ columns: ['本文'], rows: [['</script>']] }, 'a.tsv');
    expect(out).not.toContain('</script>"');
    expect(out).toContain('\\u003c/script>');
  });

  it('出どころを属性に持つ（画面の側から名前で引ける）', () => {
    expect(toDataScript(TABLE, 'data/売上.tsv')).toContain(
      '<script type="application/json" data-source="data/売上.tsv">',
    );
  });

  it('引用符と & は属性の中で逃がす', () => {
    expect(toDataScript(TABLE, 'a"&b.tsv')).toContain('data-source="a&quot;&amp;b.tsv"');
  });
});
