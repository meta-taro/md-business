import { describe, it, expect, beforeEach } from 'vitest';
import { decorateSheet } from '../src/viewer/sheetEditor.js';

const SHEET = [
  '#! md-business:test-spec-tsv/v1',
  '#@ rowid _id',
  '#@ computed No. = rowNumber()',
  'No.:number\t手順:multiline\t結果:enum(OK|NG|保留|未実施)\t実施日:date\t_id',
  '1\t開く\\n押す\tOK\t\tr000000000001',
  '2\t閉じる\t未実施\t\tr000000000002',
].join('\n');

/** 描画済みの表（renderer の出力と同じ形）。 */
const RENDERED = `
<article class="mdb-tsv-sheet">
  <table class="mdb-tsv-sheet__table">
    <thead><tr><th>No.</th><th>手順</th><th>結果</th><th>実施日</th></tr></thead>
    <tbody>
      <tr><td class="mdb-tsv-sheet__cell">1</td><td class="mdb-tsv-sheet__cell">開く<br>押す</td><td class="mdb-tsv-sheet__cell">OK</td><td class="mdb-tsv-sheet__cell"></td></tr>
      <tr><td class="mdb-tsv-sheet__cell">2</td><td class="mdb-tsv-sheet__cell">閉じる</td><td class="mdb-tsv-sheet__cell">未実施</td><td class="mdb-tsv-sheet__cell"></td></tr>
    </tbody>
  </table>
</article>`;

let host: HTMLElement;
let source: string;
let commits: string[];

function setup(text: string, html = RENDERED): void {
  source = text;
  commits = [];
  host.innerHTML = html;
  decorateSheet(host, {
    getSource: () => source,
    commit: (next) => {
      commits.push(next);
      source = next;
    },
  });
}

function cell(row: number, col: number): HTMLTableCellElement {
  return host.querySelectorAll('tbody tr')[row]?.querySelectorAll('td')[col] as HTMLTableCellElement;
}

function key(el: Element, name: string, init: KeyboardEventInit = {}): void {
  el.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, ...init }));
}

beforeEach(() => {
  document.body.innerHTML = '<div id="host"></div>';
  host = document.getElementById('host') as HTMLElement;
});

describe('decorateSheet', () => {
  it('選択肢の列はプルダウンで開き、選んだ値で書き換える', () => {
    setup(SHEET);
    cell(1, 2).click();
    const select = cell(1, 2).querySelector('select') as HTMLSelectElement;
    expect([...select.options].map((o) => o.value)).toEqual(['', 'OK', 'NG', '保留', '未実施']);
    expect(select.value).toBe('未実施');
    select.value = 'NG';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(commits).toHaveLength(1);
    expect(commits[0]?.split('\n')[5]).toBe('2\t閉じる\tNG\t\tr000000000002');
  });

  it('複数行の列は印を戻した値で開き、Ctrl+Enter で確定する', () => {
    setup(SHEET);
    cell(0, 1).click();
    const area = cell(0, 1).querySelector('textarea') as HTMLTextAreaElement;
    expect(area.value).toBe('開く\n押す');
    key(area, 'Enter');
    expect(commits).toHaveLength(0);
    area.value = '開く\n押す\n待つ';
    key(area, 'Enter', { ctrlKey: true });
    expect(commits[0]?.split('\n')[4]).toBe('1\t開く\\n押す\\n待つ\tOK\t\tr000000000001');
  });

  it('日付の列は日付の入力で開く', () => {
    setup(SHEET);
    cell(0, 3).click();
    const input = cell(0, 3).querySelector('input') as HTMLInputElement;
    expect(input.type).toBe('date');
    expect(input.max).toBe('9999-12-31');
  });

  it('Escape で元の表示に戻し、書き換えない', () => {
    setup(SHEET);
    cell(1, 1).click();
    const input = cell(1, 1).querySelector('textarea') as HTMLTextAreaElement;
    input.value = '別の手順';
    key(input, 'Escape');
    expect(commits).toHaveLength(0);
    expect(cell(1, 1).textContent).toBe('閉じる');
  });

  it('値が変わらなければ書き換えない', () => {
    setup(SHEET);
    cell(1, 1).click();
    (cell(1, 1).querySelector('textarea') as HTMLTextAreaElement).blur();
    expect(commits).toHaveLength(0);
  });

  it('計算列は開かない', () => {
    setup(SHEET);
    cell(0, 0).click();
    expect(cell(0, 0).querySelector('input, select, textarea')).toBeNull();
  });

  it('行を消す', () => {
    setup(SHEET);
    (cell(0, 0).querySelector('[data-mdb-action="delete-row"]') as HTMLButtonElement).click();
    expect(commits[0]?.split('\n').slice(4)).toEqual(['1\t閉じる\t未実施\t\tr000000000002']);
  });

  it('行を足す', () => {
    setup(SHEET);
    (host.querySelector('[data-mdb-action="add-row"]') as HTMLButtonElement).click();
    const lines = commits[0]?.split('\n') ?? [];
    expect(lines).toHaveLength(7);
    expect(lines[6]).toMatch(/^3\t\t\t\tr[0-9a-z]+$/);
  });

  it('空の行になるシートは、表に空の行を出しておき最初の値で足す', () => {
    const text = '項目\t結果:enum(OK|NG)\nA\tOK';
    setup(
      text,
      '<article class="mdb-tsv-sheet"><table class="mdb-tsv-sheet__table"><thead><tr><th>項目</th><th>結果</th></tr></thead><tbody><tr><td>A</td><td>OK</td></tr></tbody></table></article>',
    );
    (host.querySelector('[data-mdb-action="add-row"]') as HTMLButtonElement).click();
    expect(commits).toHaveLength(0);
    expect(host.querySelectorAll('tbody tr')).toHaveLength(2);
    cell(1, 0).click();
    const input = cell(1, 0).querySelector('input') as HTMLInputElement;
    input.value = 'B';
    key(input, 'Enter');
    expect(commits[0]).toBe('項目\t結果:enum(OK|NG)\nA\tOK\nB\t');
  });

  it('行が無いシートには見出しだけの表を組む', () => {
    setup(
      '#@ rowid _id\n項目\t_id',
      '<article class="mdb-tsv-sheet"><p class="mdb-tsv-sheet__empty">行がありません。</p></article>',
    );
    expect(host.querySelector('.mdb-tsv-sheet__empty')).toBeNull();
    expect([...host.querySelectorAll('thead th')].map((th) => th.textContent)).toEqual(['項目']);
    expect(host.querySelector('[data-mdb-action="add-row"]')).not.toBeNull();
  });

  it('描き直すたびに呼ばれても、操作は 1 回分しか走らない', () => {
    setup(SHEET);
    decorateSheet(host, { getSource: () => source, commit: (next) => commits.push(next) });
    (host.querySelector('[data-mdb-action="add-row"]') as HTMLButtonElement).click();
    expect(commits).toHaveLength(1);
  });
});
