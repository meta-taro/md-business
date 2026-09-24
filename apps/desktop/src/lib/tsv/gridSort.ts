/**
 * 並べ替え — 表に見せる行の順を決める（DOM 非依存の純ロジック）。
 *
 * 並べ替えは見せ方であって、ファイルの行順は書き換えない。そのため結果は並べ直した表ではなく
 * **行 ID の並び**で返し、読み込みで {@link reorderRows} に当て、保存でファイルの並びへ戻す。
 *
 * 並びは押した時点のものを持ち続ける。値を直すたびに並べ直すと、直した行が目の前から
 * 別の位置へ飛んでいく。
 */
import type { IdentifiedTsv } from '@md-business/schema-test-spec-tsv';

/** 並べる向き。 */
export type SortDirection = 'asc' | 'desc';

/** 値を何として比べるか。列の型から決める。 */
export type SortKind = 'text' | 'number' | 'date' | 'enum';

/** 並べ替えの指定。 */
export interface SortSpec {
  col: number;
  dir: SortDirection;
  kind: SortKind;
  /** `enum` のときの選択肢の並び。この順を小さい側とする。 */
  options?: readonly string[];
}

/**
 * セルの文字を数として読む。桁区切りのカンマと空白は読み飛ばす。読めなければ null。
 */
export function numberOf(value: string): number | null {
  const text = value.replace(/[,\s]/g, '');
  if (text === '') return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

const DATE = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/;

/**
 * セルの文字を、文字として比べれば日付順になる形（`YYYY-MM-DD` / `YYYY-MM-DD HH:MM`）へ直す。
 * `2026/9/5` のようなゼロ埋めの無い書き方も同じ並びに乗せる。読めなければ null。
 */
export function dateKeyOf(value: string): string | null {
  const m = DATE.exec(value.trim());
  if (m === null) return null;
  const [, y, mo, d, h, mi] = m;
  const day = `${y}-${mo!.padStart(2, '0')}-${d!.padStart(2, '0')}`;
  return h === undefined ? day : `${day} ${h.padStart(2, '0')}:${mi}`;
}

const collator = new Intl.Collator('ja', { numeric: true, sensitivity: 'base' });

/**
 * 比べる値。`readable` は列の型として読めた値で、向きに従って並べる。`raw` は読めなかった値
 * （数の列の文字・選択肢に無い値など）で、読めた値の後ろに文字の昇順で置く。空欄は null で最後。
 */
type Key = { readable: number | string } | { raw: string } | null;

function keyOf(value: string, spec: SortSpec): Key {
  const text = value.trim();
  if (text === '') return null;
  switch (spec.kind) {
    case 'number': {
      const n = numberOf(text);
      return n === null ? { raw: text } : { readable: n };
    }
    case 'date': {
      const key = dateKeyOf(text);
      return key === null ? { raw: text } : { readable: key };
    }
    case 'enum': {
      const index = spec.options?.indexOf(text) ?? -1;
      return index >= 0 ? { readable: index } : { raw: text };
    }
    case 'text':
      return { readable: text };
  }
}

/** 並べる順の段。読めた値 → 読めなかった値 → 空欄。 */
function tierOf(key: Key): number {
  if (key === null) return 2;
  return 'readable' in key ? 0 : 1;
}

function compareValues(a: number | string, b: number | string): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return collator.compare(String(a), String(b));
}

/**
 * 指定の列で並べた行 ID の並びを返す。
 *
 * 空欄と読めない値は向きによらず末尾に置く。降順にしたとたん空欄が先頭に並ぶと、
 * 見たい行が画面の外へ押し出される。同じ値の行は元の並びを保つ。
 */
export function sortedRowIds(doc: IdentifiedTsv, spec: SortSpec): string[] {
  const sign = spec.dir === 'asc' ? 1 : -1;
  const entries = doc.rows.map((cells, index) => ({
    index,
    key: keyOf(cells[spec.col] ?? '', spec),
  }));

  entries.sort((a, b) => {
    const tier = tierOf(a.key) - tierOf(b.key);
    if (tier !== 0) return tier;
    let order = 0;
    if (a.key !== null && b.key !== null) {
      if ('readable' in a.key && 'readable' in b.key) {
        order = sign * compareValues(a.key.readable, b.key.readable);
      } else if ('raw' in a.key && 'raw' in b.key) {
        order = compareValues(a.key.raw, b.key.raw);
      }
    }
    return order || a.index - b.index;
  });

  return entries.map((entry) => doc.rowIds[entry.index] ?? '');
}

/**
 * 表の行を、行 ID の並び `order` に合わせて並べ直す。
 *
 * 並びに無い行（並べた後に足した行）は、表の中で直前にあった行の後ろに付いていく。
 * 同じ関数で「見せる順へ並べる」と「ファイルの順へ戻す」の両方をやるので、並べた表で
 * 足した行は、戻したファイルでも足した位置の近くに入る。並びにあって表に無い行
 * （並べた後に消した行）は飛ばす。
 */
export function reorderRows(doc: IdentifiedTsv, order: readonly string[]): IdentifiedTsv {
  const known = new Set(order);
  const byId = new Map<string, string[]>();
  // 並びに無い行を、直前にあった並びの行ごとに束ねる（null は先頭）。
  const followers = new Map<string | null, number[]>();

  let anchor: string | null = null;
  doc.rows.forEach((cells, index) => {
    const id = doc.rowIds[index] ?? '';
    if (known.has(id)) {
      byId.set(id, cells);
      anchor = id;
      return;
    }
    const list = followers.get(anchor) ?? [];
    list.push(index);
    followers.set(anchor, list);
  });

  const rows: string[][] = [];
  const rowIds: string[] = [];
  const pushFollowers = (key: string | null): void => {
    for (const index of followers.get(key) ?? []) {
      rows.push(doc.rows[index] ?? []);
      rowIds.push(doc.rowIds[index] ?? '');
    }
  };

  pushFollowers(null);
  for (const id of order) {
    const cells = byId.get(id);
    if (cells === undefined) continue;
    rows.push(cells);
    rowIds.push(id);
    pushFollowers(id);
  }

  return { ...doc, rows, rowIds };
}
