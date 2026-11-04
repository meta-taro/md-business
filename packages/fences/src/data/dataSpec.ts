/**
 * 本文に置いたデータの指定（```data ブロックの中身）を読む。
 *
 * 図の指定（`chart/chartSpec`）と同じく「1 行 1 項目」の素朴な形にしてある。書くのは
 * 表の出どころだけなので指定は 1 つしか無いが、打ち間違いを黙って捨てないために、
 * 知らない名前は通さない。
 *
 * 通らないときは**最初の 1 つだけ**を返す。文言はここで作らない（読み手の言語は
 * アプリ側が持つ）。
 */

export interface DataSpec {
  /** 表の出どころ。開いているフォルダから見たパス。解決はここではしない。 */
  source: string;
}

export type DataProblemKind =
  /** 指定が 1 つも書かれていない。 */
  | 'empty'
  /** `名前: 値` の形になっていない行がある。 */
  | 'syntax'
  /** 知らない指定名。 */
  | 'unknown-key'
  | 'duplicate-key'
  /** 要る指定が無い。 */
  | 'missing';

export interface DataProblem {
  kind: DataProblemKind;
  /** 文言に埋める対象（指定名か、通らなかった値）。 */
  raw: string;
  /** ブロックの中での行番号（1 始まり）。行に紐づかないものは null。 */
  line: number | null;
}

export type ParseDataSpecResult =
  | { ok: true; spec: DataSpec }
  | { ok: false; problem: DataProblem };

const KEYS = ['source'] as const;
type Key = (typeof KEYS)[number];

function isKey(name: string): name is Key {
  return (KEYS as readonly string[]).includes(name);
}

function fail(kind: DataProblemKind, raw: string, line: number | null): ParseDataSpecResult {
  return { ok: false, problem: { kind, raw, line } };
}

export function parseDataSpec(source: string): ParseDataSpecResult {
  const values = new Map<Key, string>();

  const lines = source.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const text = lines[index].trim();
    if (text === '' || text.startsWith('#')) continue;

    const at = text.indexOf(':');
    if (at <= 0) return fail('syntax', text, index + 1);

    const name = text.slice(0, at).trim();
    if (!isKey(name)) return fail('unknown-key', name, index + 1);
    if (values.has(name)) return fail('duplicate-key', name, index + 1);
    // 値の側の区切りは残す（`C:/…` のような値が書かれうる）。
    values.set(name, text.slice(at + 1).trim());
  }

  if (values.size === 0) return fail('empty', '', null);

  const path = values.get('source');
  if (path === undefined || path === '') return fail('missing', 'source', null);

  return { ok: true, spec: { source: path } };
}
