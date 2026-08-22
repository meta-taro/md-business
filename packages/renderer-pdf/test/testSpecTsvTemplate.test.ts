import { describe, it, expect } from 'vitest';
import { renderTestSpecTsvBody } from '../src/testSpecTsvTemplate.js';
import { standardTsvSheet } from './testSpecTsvFixtures.js';

describe('renderTestSpecTsvBody', () => {
  it('puts the title, meta pairs and notes above the table', () => {
    const html = renderTestSpecTsvBody(standardTsvSheet());
    expect(html).toContain('mdb-tsv-sheet');
    expect(html).toContain('デスクトップ v0.24.0 検証シート');
    expect(html).toContain('<dt>文書番号</dt><dd>TEST-md-business-015</dd>');
    expect(html).toContain('実物を動かして目で見た人だけ');
    // 表よりも前に出る（読み手が何のシートか分かってから行に入る）。
    expect(html.indexOf('mdb-tsv-sheet__head')).toBeLessThan(html.indexOf('<table'));
  });

  it('omits the meta list and the notes list when there are none', () => {
    const html = renderTestSpecTsvBody(standardTsvSheet({ meta: [], notes: [] }));
    expect(html).not.toContain('mdb-tsv-sheet__meta');
    expect(html).not.toContain('mdb-tsv-sheet__notes');
  });

  it('renders the header row inside <thead> so it repeats on every page', () => {
    const html = renderTestSpecTsvBody(standardTsvSheet());
    expect(html).toContain('<thead>');
    expect(html).toContain('<th scope="col"');
    expect(html.indexOf('<thead>')).toBeLessThan(html.indexOf('<tbody>'));
  });

  it('turns cell newlines into <br> instead of collapsing them', () => {
    const html = renderTestSpecTsvBody(standardTsvSheet());
    expect(html).toContain('1. .tsv を開く<br>2. 下見を押す');
  });

  it('paints the row tint and keeps the value text (color is not the only signal)', () => {
    const html = renderTestSpecTsvBody(standardTsvSheet());
    expect(html).toContain('--mdb-row-tint:#e7f6ec');
    expect(html).toContain('>OK<');
  });

  it('drops a tint that is not a plain hex color (no CSS injection through style)', () => {
    const html = renderTestSpecTsvBody(
      standardTsvSheet({
        rows: [{ cells: ['1', 'x', 'y', 'OK'], tint: 'red;background:url(http://x)' }],
      }),
    );
    expect(html).not.toContain('url(');
    expect(html).not.toContain('--mdb-row-tint');
  });

  it('escapes every cell, column name, meta value and note', () => {
    const html = renderTestSpecTsvBody(
      standardTsvSheet({
        title: '<script>t',
        meta: [{ key: '<script>k', value: '<script>v' }],
        notes: ['<script>n'],
        columns: [{ name: '<script>c' }],
        rows: [{ cells: ['<script>r'] }],
      }),
    );
    expect(html).not.toContain('<script>');
    expect(html.match(/&lt;script&gt;/g)?.length).toBe(6);
  });

  it('spreads column widths as percentages of their declared total', () => {
    const html = renderTestSpecTsvBody(
      standardTsvSheet({
        columns: [
          { name: 'a', width: 100 },
          { name: 'b', width: 300 },
        ],
        rows: [{ cells: ['x', 'y'] }],
      }),
    );
    expect(html).toContain('<colgroup>');
    expect(html).toContain('width:25%');
    expect(html).toContain('width:75%');
  });

  it('leaves the widths to the browser when no column declares one', () => {
    const html = renderTestSpecTsvBody(
      standardTsvSheet({ columns: [{ name: 'a' }, { name: 'b' }], rows: [{ cells: ['x', 'y'] }] }),
    );
    expect(html).not.toContain('<colgroup>');
  });

  it('aligns cells by the column declaration', () => {
    const html = renderTestSpecTsvBody(standardTsvSheet());
    expect(html).toContain('mdb-tsv-sheet__cell--right');
    expect(html).toContain('mdb-tsv-sheet__cell--center');
  });

  it('pads a short row so the columns stay lined up', () => {
    const html = renderTestSpecTsvBody(standardTsvSheet({ rows: [{ cells: ['1'] }] }));
    const cells = html.match(/<td/g) ?? [];
    expect(cells.length).toBe(4);
  });

  it('still prints cells that overflow the header (does not hide them)', () => {
    const html = renderTestSpecTsvBody(
      standardTsvSheet({ rows: [{ cells: ['1', 'a', 'b', 'OK', 'はみ出し'] }] }),
    );
    expect(html).toContain('はみ出し');
  });

  it('says so when there are no rows rather than printing an empty table', () => {
    const html = renderTestSpecTsvBody(standardTsvSheet({ rows: [] }));
    expect(html).toContain('mdb-tsv-sheet__empty');
  });
});
