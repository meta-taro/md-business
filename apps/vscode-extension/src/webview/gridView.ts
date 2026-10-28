import type { CellEdit, GridColumn, GridModel, GridRow } from '../grid/model.js';

type OnEdit = (edit: CellEdit) => void;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 表を組み直す。セルの文字はすべて textContent / value で入れ、HTML として解釈しない
 * （検証シートは手元のファイルなので、中身を信頼できるとは限らない）。
 *
 * 書き換えるたびに拡張から新しい内容が届いて描き直すので、入力中のセルの
 * フォーカスを描き直しの前後で引き継ぐ。引き継がないと Tab で次へ進めない。
 */
export function renderGrid(root: HTMLElement, model: GridModel | null, onEdit: OnEdit): void {
  const focused = focusKey(root);
  root.replaceChildren();

  if (model === null) {
    const p = document.createElement('p');
    p.textContent =
      '表で開けるのは、1 行目が #! md-business:test-spec-tsv/v1 の検証シートだけです。テキストエディタで開き直してください。';
    root.append(p);
    return;
  }

  if (model.title !== '') {
    const h1 = document.createElement('h1');
    h1.textContent = model.title;
    root.append(h1);
  }

  const table = document.createElement('table');
  const headRow = table.createTHead().insertRow();
  for (const column of model.columns) {
    const th = document.createElement('th');
    th.textContent = column.name;
    if (column.required) {
      const mark = document.createElement('span');
      mark.className = 'required';
      mark.title = '必須';
      mark.textContent = '*';
      th.append(mark);
    }
    headRow.append(th);
  }

  const body = table.createTBody();
  for (const row of model.rows) {
    const tr = body.insertRow();
    model.columns.forEach((column, position) => {
      const td = tr.insertCell();
      td.append(cellControl(row, column, row.cells[position] ?? '', onEdit));
    });
  }
  root.append(table);

  if (focused !== null) {
    root.querySelector<HTMLElement>(`[data-key="${focused}"]`)?.focus();
  }
}

function focusKey(root: HTMLElement): string | null {
  const active = document.activeElement;
  return active instanceof HTMLElement && root.contains(active) ? (active.dataset['key'] ?? null) : null;
}

function cellControl(row: GridRow, column: GridColumn, value: string, onEdit: OnEdit): HTMLElement {
  const control = createControl(column, value);
  control.dataset['line'] = String(row.line);
  control.dataset['column'] = String(column.index);
  control.dataset['key'] = `${row.line}:${column.index}`;
  if (column.locked) return control;

  control.addEventListener('change', () => {
    onEdit({
      line: row.line,
      column: column.index,
      ...(row.id === undefined ? {} : { id: row.id }),
      before: value,
      value: readControl(control),
    });
  });
  return control;
}

function createControl(column: GridColumn, value: string): HTMLElement {
  if (column.locked) {
    const span = document.createElement('span');
    span.className = 'locked';
    span.title = 'ほかの値から決まる列です';
    span.textContent = value;
    return span;
  }

  if (column.options !== undefined) {
    const select = document.createElement('select');
    // 一覧に無い値も選択肢に足す。足さないと表示した時点で値が消えたように見える。
    const options = ['', ...column.options];
    if (!options.includes(value)) options.push(value);
    for (const option of options) select.add(new Option(option, option));
    select.value = value;
    return select;
  }

  if (column.type === 'multiline_text') {
    const textarea = document.createElement('textarea');
    textarea.rows = Math.max(2, value.split('\n').length);
    textarea.value = value;
    return textarea;
  }

  const input = document.createElement('input');
  if (column.type === 'checkbox') {
    input.type = 'checkbox';
    input.checked = value === 'TRUE';
    return input;
  }
  // 日付欄に「10月上旬」のような書き方が入っていることがある。日付ピッカーに入れると
  // 空に見えてしまうので、その行だけ文字で出す。
  input.type = column.type === 'date' && (value === '' || ISO_DATE.test(value)) ? 'date' : 'text';
  input.value = value;
  return input;
}

function readControl(control: HTMLElement): string {
  if (control instanceof HTMLInputElement && control.type === 'checkbox') {
    return control.checked ? 'TRUE' : 'FALSE';
  }
  if (
    control instanceof HTMLInputElement ||
    control instanceof HTMLSelectElement ||
    control instanceof HTMLTextAreaElement
  ) {
    return control.value;
  }
  return '';
}
