/**
 * プレビューに描いた検証シートの表を、その場で直せるようにする。
 *
 * 描画は毎回作り直される（host の innerHTML を差し替える）ので、ここは描き終わった表へ
 * 印と操作ボタンを足すだけにする。値の書き換えは tsvEdit がテキストに対して行い、
 * 結果を呼び出し側へ返す。表の DOM を正本にしない（描画は整形済みで、素の値ではない）。
 */
import {
  appendTsvRow,
  deleteTsvRow,
  editTsvCell,
  readEditColumns,
  readTsvCell,
  type EditColumn,
} from '../shared/tsvEdit.js';

export interface SheetEditorHooks {
  /** 今のテキスト。 */
  getSource(): string;
  /** 書き換えたテキストを受け取る。描き直しは呼び出し側が行う。 */
  commit(next: string): void;
}

/** 表の上で直す部品の見た目。印刷は別に組むので、ここで足した部品は PDF に出ない。 */
export const SHEET_EDIT_CSS = `
  .mdb-sheet-edit__cell { cursor: text; position: relative; }
  .mdb-sheet-edit__cell:hover { background: rgba(37, 99, 235, 0.06); outline: 1px solid rgba(37, 99, 235, 0.35); outline-offset: -1px; }
  .mdb-sheet-edit__locked { position: relative; }
  .mdb-sheet-edit__editing { padding: 0 !important; outline: 2px solid #2563eb; outline-offset: -2px; }
  .mdb-sheet-edit__field { box-sizing: border-box; width: 100%; min-width: 6em; margin: 0; padding: 4px 6px; border: 0; font: inherit; background: white; }
  textarea.mdb-sheet-edit__field { resize: vertical; min-height: 3em; }
  .mdb-sheet-edit__delete { position: absolute; left: -22px; top: 50%; transform: translateY(-50%); width: 18px; height: 18px; padding: 0; border: 0; border-radius: 50%; background: #dc2626; color: white; font-size: 12px; line-height: 18px; cursor: pointer; opacity: 0; }
  tr:hover > td > .mdb-sheet-edit__delete, .mdb-sheet-edit__delete:focus-visible { opacity: 1; }
  .mdb-sheet-edit__add { margin-top: 8px; padding: 4px 12px; border: 1px dashed #94a3b8; border-radius: 4px; background: transparent; color: #334155; font: inherit; font-size: 12px; cursor: pointer; }
  .mdb-sheet-edit__add:hover { border-color: #2563eb; color: #2563eb; }
`;

const CELL = 'mdb-sheet-edit__cell';
const LOCKED = 'mdb-sheet-edit__locked';
const EDITING = 'mdb-sheet-edit__editing';
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

interface Bound {
  hooks: SheetEditorHooks;
  columns: EditColumn[];
}

// host は描き直しても同じ要素のまま残る。操作の受け口は 1 回だけ付け、
// 描き直しのたびに手元の情報だけを入れ替える。
const bound = new WeakMap<HTMLElement, Bound>();

/** 描き終わった表へ、セルの印と行の追加・削除を足す。 */
export function decorateSheet(host: HTMLElement, hooks: SheetEditorHooks): void {
  const columns = readEditColumns(hooks.getSource());
  if (columns.length === 0) return;
  const table = ensureTable(host, columns);
  if (!table) return;

  const first = bound.get(host) === undefined;
  bound.set(host, { hooks, columns });
  if (first) host.addEventListener('click', (event) => onClick(host, event));

  const body = table.tBodies[0];
  if (!body) return;
  [...body.rows].forEach((tr, row) => markRow(tr, row, columns));

  table.parentElement?.querySelector(':scope > .mdb-sheet-edit__add')?.remove();
  const add = host.ownerDocument.createElement('button');
  add.type = 'button';
  add.className = 'mdb-sheet-edit__add';
  add.dataset['mdbAction'] = 'add-row';
  add.textContent = '＋ 行を追加';
  table.after(add);
}

/** 行が無いシートは本文に表が無い。見出しだけの表を組んで、足す先を作る。 */
function ensureTable(host: HTMLElement, columns: EditColumn[]): HTMLTableElement | null {
  const existing = host.querySelector<HTMLTableElement>('table.mdb-tsv-sheet__table');
  if (existing) return existing;
  const empty = host.querySelector('.mdb-tsv-sheet__empty');
  if (!empty) return null;

  const doc = host.ownerDocument;
  const table = doc.createElement('table');
  table.className = 'mdb-tsv-sheet__table';
  const head = table.createTHead().insertRow();
  for (const column of columns) {
    const th = doc.createElement('th');
    th.scope = 'col';
    th.className = 'mdb-tsv-sheet__cell';
    th.textContent = column.name;
    head.appendChild(th);
  }
  table.createTBody();
  empty.replaceWith(table);
  return table;
}

function markRow(tr: HTMLTableRowElement, row: number, columns: EditColumn[]): void {
  tr.dataset['row'] = String(row);
  [...tr.cells].forEach((td, col) => {
    if (col >= columns.length) return;
    td.dataset['col'] = String(col);
    td.classList.add(columns[col]?.locked ? LOCKED : CELL);
  });
  const lead = tr.cells[0];
  if (!lead || lead.querySelector('[data-mdb-action="delete-row"]')) return;
  const remove = tr.ownerDocument.createElement('button');
  remove.type = 'button';
  remove.className = 'mdb-sheet-edit__delete';
  remove.dataset['mdbAction'] = 'delete-row';
  remove.title = 'この行を削除';
  remove.setAttribute('aria-label', 'この行を削除');
  remove.textContent = '×';
  lead.appendChild(remove);
}

function onClick(host: HTMLElement, event: Event): void {
  const state = bound.get(host);
  const target = event.target;
  if (!state || !(target instanceof Element)) return;

  const action = target.closest<HTMLElement>('[data-mdb-action]');
  if (action?.dataset['mdbAction'] === 'add-row') {
    addRow(host, state);
    return;
  }
  if (action?.dataset['mdbAction'] === 'delete-row') {
    const row = rowOf(action);
    if (row === null || action.closest('tr')?.dataset['pending'] !== undefined) {
      action.closest('tr')?.remove();
      return;
    }
    const next = deleteTsvRow(state.hooks.getSource(), row);
    if (next !== null) state.hooks.commit(next);
    return;
  }

  const td = target.closest<HTMLTableCellElement>(`td.${CELL}`);
  if (td && !td.classList.contains(EDITING)) openEditor(td, state);
}

/**
 * 行を足す。ID 列も計算列も無いシートは、足しても空の行にしかならず、ファイルに置くと
 * 読み飛ばされて消える。そのときは表にだけ空の行を出し、最初に打った値で入れる。
 */
function addRow(host: HTMLElement, state: Bound): void {
  const source = state.hooks.getSource();
  const next = appendTsvRow(source);
  if (next !== null) {
    state.hooks.commit(next);
    return;
  }
  const body = host.querySelector<HTMLTableElement>('table.mdb-tsv-sheet__table')?.tBodies[0];
  if (!body || body.querySelector('tr[data-pending]')) return;
  const tr = body.insertRow();
  tr.dataset['pending'] = '';
  for (let i = 0; i < state.columns.length; i += 1) tr.insertCell().className = 'mdb-tsv-sheet__cell';
  markRow(tr, body.rows.length - 1, state.columns);
}

function rowOf(el: Element): number | null {
  const value = el.closest('tr')?.dataset['row'];
  return value === undefined ? null : Number(value);
}

type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

function openEditor(td: HTMLTableCellElement, state: Bound): void {
  const row = rowOf(td);
  const col = Number(td.dataset['col']);
  const column = state.columns[col];
  if (row === null || !column) return;

  const source = state.hooks.getSource();
  const pending = td.closest('tr')?.dataset['pending'] !== undefined;
  const current = pending ? '' : (readTsvCell(source, row, col) ?? '');
  const field = buildField(td.ownerDocument, column, current);
  const saved = [...td.childNodes];
  let done = false;

  const finish = (keep: boolean): void => {
    if (done) return;
    done = true;
    const value = field.value;
    if (keep && value !== current) {
      const next = editTsvCell(source, row, col, value);
      if (next !== null && next !== source) {
        state.hooks.commit(next);
        return;
      }
    }
    td.classList.remove(EDITING);
    td.replaceChildren(...saved);
  };

  field.addEventListener('keydown', (event) => {
    const key = (event as KeyboardEvent).key;
    if (key === 'Escape') {
      event.preventDefault();
      finish(false);
      return;
    }
    if (key !== 'Enter') return;
    // 複数行の欄では Enter は改行。確定は Ctrl / ⌘ + Enter。
    const ke = event as KeyboardEvent;
    if (field instanceof HTMLTextAreaElement && !ke.ctrlKey && !ke.metaKey) return;
    event.preventDefault();
    finish(true);
  });
  field.addEventListener('blur', () => finish(true));
  if (field instanceof HTMLSelectElement) field.addEventListener('change', () => finish(true));

  td.classList.add(EDITING);
  td.replaceChildren(field);
  field.focus();
}

function buildField(doc: Document, column: EditColumn, current: string): Field {
  if (column.choices.length > 0) {
    const select = doc.createElement('select');
    // 選択肢に無い値も消さずに選べるようにしておく（開いただけで値が変わらないように）。
    const values = ['', ...column.choices];
    if (!values.includes(current)) values.push(current);
    for (const value of values) select.add(new Option(value, value));
    select.value = current;
    return withClass(select);
  }
  if (column.type === 'multiline_text') {
    const area = doc.createElement('textarea');
    area.value = current;
    area.rows = Math.max(2, current.split('\n').length);
    return withClass(area);
  }
  const input = doc.createElement('input');
  // 日付の欄は、形が合わない値のまま開くと空に見え、そのまま確定すると消える。
  // 合わないときは文字の欄で開く。
  if (column.type === 'date' && !column.datetime && (current === '' || DATE.test(current))) {
    input.type = 'date';
    input.max = '9999-12-31';
  } else if (column.type === 'date' && column.datetime && (current === '' || DATETIME.test(current))) {
    input.type = 'datetime-local';
    input.max = '9999-12-31T23:59';
  } else {
    input.type = 'text';
  }
  input.value = current;
  return withClass(input);
}

function withClass<T extends Field>(field: T): T {
  field.className = 'mdb-sheet-edit__field';
  return field;
}
