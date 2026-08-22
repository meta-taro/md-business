import { escapeHtml } from './escape.js';

/**
 * 印刷用の版面へ流し込む列。名前以外はすべて任意で、無ければ browser 既定に委ねる。
 */
export interface TestSpecTsvPrintColumn {
  /** 見出しに出す列名。 */
  name: string;
  /** セルの寄せ。省略で左。 */
  align?: 'left' | 'center' | 'right';
  /**
   * 版面上の相対幅。画面の列幅をそのまま渡してよく、比率だけを使う
   * （紙幅は画面幅と違うので、px をそのまま置いても意味を持たない）。
   */
  width?: number;
}

/** 印刷用の版面へ流し込む 1 行。 */
export interface TestSpecTsvPrintRow {
  /** 列順のセル値。セル内改行は `\n`。 */
  cells: string[];
  /** 行の地色（`#rgb` / `#rrggbb`）。それ以外は捨てる。 */
  tint?: string;
}

/**
 * 検証シート（カスタム TSV）を紙に出すための、**解決済み**の入力。
 *
 * ディレクティブの解釈はここへ持ち込まない。`#@ style` や `#@ colwidth` の書式は
 * 編集側（デスクトップ）の都合で増減するので、印刷側がそれを知ると
 * 書式が 1 つ増えるたびに両方を直すことになる。
 */
export interface TestSpecTsvPrintDoc {
  /** 表題（`# タイトル:` 等・呼び出し側が決める）。 */
  title: string;
  /** ヘッダのメタ（`# キー: 値`）を宣言順に。 */
  meta: Array<{ key: string; value: string }>;
  /** 注記（`#@ note`）を宣言順に。 */
  notes: string[];
  /** 列定義（表示する順）。 */
  columns: TestSpecTsvPrintColumn[];
  /** 行（控えにした行は呼び出し側で外しておく）。 */
  rows: TestSpecTsvPrintRow[];
}

/** インライン style へ流してよい色の形。任意文字列を通すと CSS を差し込まれる。 */
const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

const ALIGN_CLASS: Record<string, string> = {
  center: ' mdb-tsv-sheet__cell--center',
  right: ' mdb-tsv-sheet__cell--right',
};

/** escape したうえでセル内改行を `<br>` にする。行の高さは CSS 側で決める。 */
function cellHtml(value: string): string {
  return escapeHtml(value).split('\n').join('<br>');
}

function alignClass(column: TestSpecTsvPrintColumn | undefined): string {
  return column?.align ? (ALIGN_CLASS[column.align] ?? '') : '';
}

/**
 * 宣言された幅を合計に対する百分率へ均す。1 つも宣言が無ければ `<colgroup>` を出さず、
 * 列幅の決定をそのまま browser へ預ける（0 幅の列を作らない）。
 */
function renderColgroup(columns: TestSpecTsvPrintColumn[]): string {
  const total = columns.reduce((sum, column) => sum + (column.width ?? 0), 0);
  if (total <= 0) return '';

  const cols = columns
    .map((column) => {
      const ratio = ((column.width ?? 0) / total) * 100;
      // 小数第 2 位まで。丸めた合計が 100% を少し外れても表の幅は崩れない。
      return `<col style="width:${Math.round(ratio * 100) / 100}%">`;
    })
    .join('');
  return `<colgroup>${cols}</colgroup>`;
}

function renderMeta(meta: TestSpecTsvPrintDoc['meta']): string {
  if (meta.length === 0) return '';
  const items = meta
    .map((entry) => `<dt>${escapeHtml(entry.key)}</dt><dd>${escapeHtml(entry.value)}</dd>`)
    .join('');
  return `<dl class="mdb-tsv-sheet__meta">${items}</dl>`;
}

function renderNotes(notes: string[]): string {
  if (notes.length === 0) return '';
  const items = notes.map((note) => `<li>${cellHtml(note)}</li>`).join('');
  return `<ul class="mdb-tsv-sheet__notes">${items}</ul>`;
}

function renderRow(row: TestSpecTsvPrintRow, columns: TestSpecTsvPrintColumn[]): string {
  // 列より短い行は空セルで埋める。列より長い行はそのまま出す＝紙の上でも
  // はみ出していることが見える（黙って落とすと、消えたことに気づけない）。
  const width = Math.max(columns.length, row.cells.length);
  const cells: string[] = [];
  for (let index = 0; index < width; index += 1) {
    const value = row.cells[index] ?? '';
    cells.push(
      `<td class="mdb-tsv-sheet__cell${alignClass(columns[index])}">${cellHtml(value)}</td>`,
    );
  }

  const tint = row.tint !== undefined && HEX_COLOR.test(row.tint) ? row.tint : null;
  const attrs =
    tint === null
      ? ''
      : ` class="mdb-tsv-sheet__row--tinted" style="--mdb-row-tint:${tint}"`;
  return `<tr${attrs}>${cells.join('')}</tr>`;
}

/**
 * 検証シート（カスタム TSV）の印刷用 body 断片を組む。
 *
 * 編集グリッドをそのまま紙へ写さない。グリッドは画面へ収めるために列を詰め、
 * 行を間引いて描いているので、写しても読めるものにならない。ここでは
 * 見出しを `<thead>` に置いて各ページで繰り返し、セル内改行を復元し、
 * 行の地色だけを引き継いだ表として組み直す。
 */
export function renderTestSpecTsvBody(doc: TestSpecTsvPrintDoc): string {
  const head = `
    <header class="mdb-tsv-sheet__head">
      <h1 class="mdb-tsv-sheet__title">${escapeHtml(doc.title)}</h1>
      ${renderMeta(doc.meta)}
      ${renderNotes(doc.notes)}
    </header>
  `;

  const headerCells = doc.columns
    .map(
      (column) =>
        `<th scope="col" class="mdb-tsv-sheet__cell${alignClass(column)}">${cellHtml(column.name)}</th>`,
    )
    .join('');

  const body =
    doc.rows.length === 0
      ? '<p class="mdb-tsv-sheet__empty">行がありません。</p>'
      : `
    <table class="mdb-tsv-sheet__table">
      ${renderColgroup(doc.columns)}
      <thead><tr>${headerCells}</tr></thead>
      <tbody>${doc.rows.map((row) => renderRow(row, doc.columns)).join('')}</tbody>
    </table>
  `;

  return `
    <article class="mdb-tsv-sheet">
      ${head}
      ${body}
    </article>
  `;
}
