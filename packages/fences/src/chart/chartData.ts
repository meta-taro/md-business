/**
 * 図の元になる数字を、TSV から取り出す。
 *
 * 表そのものは業務スキーマを持たない素の TSV（月次の書き出しなど）なので、
 * 検証シートの読み取りとは分けてある。こちらに要るのは「見出しと値」だけ。
 *
 * 空欄は 0 にしない（`docs/data-cell-conventions.md`）。「その日は 0 だった」と
 * 「その日は分からない」は別のことで、0 に倒すと折れ線が谷を描き、実際には無い
 * 落ち込みが図になる。空欄は空欄のまま渡し、描く側で線を途切れさせる。
 */

export interface DataTable {
  columns: string[];
  rows: string[][];
}

/** 図に渡す形。値は空欄なら null。 */
export interface ChartSeries {
  name: string;
  values: (number | null)[];
}

export interface ChartData {
  labels: string[];
  series: ChartSeries[];
  /** 数として読めなかったセルの数（空欄は数えない）。黙って消さずに数だけ残す。 */
  unreadable: number;
}

export type ChartDataProblemKind =
  /** 指定された列が表に無い。 */
  | 'no-column'
  /** 見出しだけで中身が無い。 */
  | 'no-rows'
  /** 列はあるが、数として読めた値が 1 つも無い。 */
  | 'no-numbers';

export interface ChartDataProblem {
  kind: ChartDataProblemKind;
  raw: string;
}

export type BuildChartDataResult =
  | { ok: true; data: ChartData }
  | { ok: false; problem: ChartDataProblem };

/** 列の指定だけを受け取る（図の種類や題名は描く側の話なので要らない）。 */
export interface ChartColumns {
  x: string;
  y: string[];
}

/**
 * 素の TSV を見出しと行に分ける。`#` で始まる行は覚え書きとして読み飛ばす
 * （取得日時・取得元をその形で置くため）。
 */
export function parseDataTable(text: string): DataTable {
  const lines = text
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '' && !line.trimStart().startsWith('#'));
  if (lines.length === 0) return { columns: [], rows: [] };

  const columns = lines[0].split('\t').map((name) => name.trim());
  const rows = lines.slice(1).map((line) => {
    const cells = line.split('\t');
    // 行の途中で終わっている表は珍しくない。足りない分は空欄として揃える。
    while (cells.length < columns.length) cells.push('');
    return cells;
  });
  return { columns, rows };
}

/** 数として読む。桁区切りは落とす。読めなければ null。 */
function toNumber(cell: string): number | null {
  const text = cell.trim().replace(/,/g, '');
  if (text === '') return null;
  if (!/^[+-]?(\d+(\.\d+)?|\.\d+)$/.test(text)) return null;
  return Number(text);
}

export function buildChartData(table: DataTable, columns: ChartColumns): BuildChartDataResult {
  const xIndex = table.columns.indexOf(columns.x);
  if (xIndex < 0) return { ok: false, problem: { kind: 'no-column', raw: columns.x } };

  const picked: { name: string; index: number }[] = [];
  for (const name of columns.y) {
    const index = table.columns.indexOf(name);
    if (index < 0) return { ok: false, problem: { kind: 'no-column', raw: name } };
    picked.push({ name, index });
  }

  if (table.rows.length === 0) return { ok: false, problem: { kind: 'no-rows', raw: '' } };

  let unreadable = 0;
  const series: ChartSeries[] = [];
  for (const { name, index } of picked) {
    const values = table.rows.map((row) => {
      const cell = row[index] ?? '';
      const value = toNumber(cell);
      // 空欄は「分からない」。それ以外で読めないものだけを数える。
      if (value === null && cell.trim() !== '') unreadable += 1;
      return value;
    });
    if (values.every((value) => value === null)) {
      return { ok: false, problem: { kind: 'no-numbers', raw: name } };
    }
    series.push({ name, values });
  }

  return {
    ok: true,
    data: { labels: table.rows.map((row) => row[xIndex] ?? ''), series, unreadable },
  };
}
