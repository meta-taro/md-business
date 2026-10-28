// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import type { CellEdit, GridModel } from '../src/grid/model.js';
import { renderGrid } from '../src/webview/gridView.js';

const MODEL: GridModel = {
  title: 'ログイン検証',
  columns: [
    { index: 0, name: 'No.', type: 'number', required: false, locked: true },
    { index: 1, name: '項目', type: 'text', required: true, locked: false },
    { index: 2, name: '手順', type: 'multiline_text', required: false, locked: false },
    {
      index: 3,
      name: '結果',
      type: 'enum',
      required: false,
      locked: false,
      options: ['OK', 'NG', '未実施'],
    },
    { index: 4, name: '実施日', type: 'date', required: false, locked: false },
    { index: 5, name: '自動化', type: 'checkbox', required: false, locked: false },
  ],
  rows: [
    { line: 5, id: 'raaaaaaaaaaaa', cells: ['1', 'ログイン', '開く\n押す', '未実施', '2026-10-01', 'TRUE'] },
    { line: 6, id: 'rcccccccccccc', cells: ['2', 'ログアウト', '', '保留中', '10月上旬', ''] },
  ],
};

const root = (): HTMLElement => document.getElementById('root') as HTMLElement;
const cell = (line: number, column: number): HTMLElement =>
  root().querySelector(`[data-line="${line}"][data-column="${column}"]`) as HTMLElement;

describe('renderGrid', () => {
  let edits: CellEdit[];
  beforeEach(() => {
    document.body.innerHTML = '<main id="root"></main>';
    edits = [];
    renderGrid(root(), MODEL, (edit) => edits.push(edit));
  });

  it('shows the title and marks required columns', () => {
    expect(root().querySelector('h1')?.textContent).toBe('ログイン検証');
    const headers = [...root().querySelectorAll('th')].map((th) => th.textContent);
    expect(headers).toEqual(['No.', '項目*', '手順', '結果', '実施日', '自動化']);
  });

  it('shows computed columns as plain text', () => {
    expect(cell(5, 0).tagName).toBe('SPAN');
    expect(cell(5, 0).textContent).toBe('1');
  });

  it('picks an input that fits each column type', () => {
    expect((cell(5, 2) as HTMLTextAreaElement).value).toBe('開く\n押す');
    expect(cell(5, 3).tagName).toBe('SELECT');
    expect((cell(5, 4) as HTMLInputElement).type).toBe('date');
    expect((cell(5, 5) as HTMLInputElement).checked).toBe(true);
  });

  it('keeps a value the list does not know instead of dropping it', () => {
    const select = cell(6, 3) as HTMLSelectElement;
    expect(select.value).toBe('保留中');
    expect([...select.options].map((o) => o.value)).toEqual(['', 'OK', 'NG', '未実施', '保留中']);
  });

  it('falls back to text for a date the picker cannot hold', () => {
    const input = cell(6, 4) as HTMLInputElement;
    expect(input.type).toBe('text');
    expect(input.value).toBe('10月上旬');
  });

  it('reports a change with what the grid was showing', () => {
    const select = cell(5, 3) as HTMLSelectElement;
    select.value = 'OK';
    select.dispatchEvent(new Event('change'));
    expect(edits).toEqual([
      { line: 5, column: 3, id: 'raaaaaaaaaaaa', before: '未実施', value: 'OK' },
    ]);
  });

  it('writes checkboxes as TRUE / FALSE', () => {
    const box = cell(5, 5) as HTMLInputElement;
    box.checked = false;
    box.dispatchEvent(new Event('change'));
    expect(edits[0]).toMatchObject({ before: 'TRUE', value: 'FALSE' });
  });

  it('does not treat markup in a cell as HTML', () => {
    renderGrid(
      root(),
      { ...MODEL, rows: [{ line: 5, cells: ['<img src=x>', '', '', '', '', ''] }] },
      () => {},
    );
    expect(root().querySelector('img')).toBeNull();
    expect(cell(5, 0).textContent).toBe('<img src=x>');
  });

  it('keeps focus on the same cell after redrawing', () => {
    cell(6, 1).focus();
    renderGrid(root(), MODEL, () => {});
    expect(document.activeElement).toBe(cell(6, 1));
  });

  it('explains why a TSV without the marker is not shown as a table', () => {
    renderGrid(root(), null, () => {});
    expect(root().querySelector('table')).toBeNull();
    expect(root().textContent).toContain('#! md-business:test-spec-tsv/v1');
  });
});
