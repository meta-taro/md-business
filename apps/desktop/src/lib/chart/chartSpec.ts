/**
 * 本文に置いた図の指定（```chart ブロックの中身）を読む。
 *
 * 指定は「1 行 1 項目」の素朴な形にしてある。frontmatter と同じ YAML にすると、
 * 本文の途中に書く短い指定のために字下げの規則まで持ち込むことになる。
 *
 * 通らないときは**最初の 1 つだけ**を返す。指定は数行しか無く、直せば次が見えるので、
 * 全部並べても読む手間が増えるだけになる。文言はここで作らない（読み手の言語は
 * アプリ側が持つ）。
 */

/** 描ける図の種類。増やすのは要求が出てから。 */
export type ChartType = 'line' | 'bar' | 'pie';

export interface ChartSpec {
  type: ChartType;
  /** 数字の出どころ。開いているフォルダから見たパス。解決はここではしない。 */
  source: string;
  /** 横軸（円グラフでは内訳の名前）に使う列。 */
  x: string;
  /** 値に使う列。複数指定できる。 */
  y: string[];
  title: string | null;
}

export type ChartProblemKind =
  /** 指定が 1 つも書かれていない。 */
  | 'empty'
  /** `名前: 値` の形になっていない行がある。 */
  | 'syntax'
  /** 知らない指定名。打ち間違いを黙って捨てないため通さない。 */
  | 'unknown-key'
  | 'duplicate-key'
  /** 要る指定が無い。 */
  | 'missing'
  /** 種類が line / bar / pie のどれでもない。 */
  | 'bad-type';

export interface ChartProblem {
  kind: ChartProblemKind;
  /** 文言に埋める対象（指定名か、通らなかった値）。 */
  raw: string;
  /** ブロックの中での行番号（1 始まり）。行に紐づかないものは null。 */
  line: number | null;
}

export type ParseChartSpecResult =
  | { ok: true; spec: ChartSpec }
  | { ok: false; problem: ChartProblem };

const KEYS = ['type', 'source', 'x', 'y', 'title'] as const;
type Key = (typeof KEYS)[number];

const TYPES: readonly string[] = ['line', 'bar', 'pie'];

function isKey(name: string): name is Key {
  return (KEYS as readonly string[]).includes(name);
}

function fail(kind: ChartProblemKind, raw: string, line: number | null): ParseChartSpecResult {
  return { ok: false, problem: { kind, raw, line } };
}

export function parseChartSpec(source: string): ParseChartSpecResult {
  const values = new Map<Key, { value: string; line: number }>();

  const lines = source.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const text = line.trim();
    if (text === '' || text.startsWith('#')) continue;

    const at = text.indexOf(':');
    if (at <= 0) return fail('syntax', text, index + 1);

    const name = text.slice(0, at).trim();
    if (!isKey(name)) return fail('unknown-key', name, index + 1);
    if (values.has(name)) return fail('duplicate-key', name, index + 1);
    // 値の側の区切りは残す（`9:00` のような値が普通にある）。
    values.set(name, { value: text.slice(at + 1).trim(), line: index + 1 });
  }

  if (values.size === 0) return fail('empty', '', null);

  const type = values.get('type');
  if (type === undefined || type.value === '') return fail('missing', 'type', null);
  if (!TYPES.includes(type.value)) return fail('bad-type', type.value, type.line);

  const source_ = values.get('source');
  if (source_ === undefined || source_.value === '') return fail('missing', 'source', null);

  const x = values.get('x');
  if (x === undefined || x.value === '') return fail('missing', 'x', null);

  const y = values.get('y');
  const columns = (y?.value ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name !== '');
  if (columns.length === 0) return fail('missing', 'y', null);

  const title = values.get('title');
  return {
    ok: true,
    spec: {
      type: type.value as ChartType,
      source: source_.value,
      x: x.value,
      y: columns,
      title: title === undefined || title.value === '' ? null : title.value,
    },
  };
}
