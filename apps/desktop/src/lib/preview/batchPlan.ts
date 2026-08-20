/**
 * 一括生成の組み立て（純粋な層）。
 *
 * 表の 1 行を 1 枚に差し込む。差し込む先は開いている文書、差し込む元は frontmatter が
 * 指す表。**画面で選ばせない**のは、同じものをもう一度出すのに操作の記憶が要るようになる
 * ため。文書に書いてあれば、文書を開き直すだけで同じ結果になる。
 *
 * ```yaml
 * batch:
 *   source: ./items.tsv
 *   name: "{{型番}}"
 * ```
 *
 * 撮る前に断れるものは全部ここで断る。100 枚の途中で止まると、どこまで出たかを
 * 数え直すことになるので、名前の衝突も列の欠けも先に見る。
 */
import { splitFrontmatter } from '@md-business/core';
import { parseDataTable } from '../chart/chartData';

/** 一度に出せる枚数の上限。 */
export const MAX_BATCH_ITEMS = 200;

/** 差し込む場所の書き方。 */
const PLACEHOLDER = /\{\{\s*([^{}]+?)\s*\}\}/g;

export interface BatchSpec {
  /** 差し込む表（文書からの相対）。 */
  source: string;
  /** 出す名前の型。`{{列名}}` を含む。 */
  name: string;
}

export type BatchProblemKind =
  /** 文書に `batch:` が無い。 */
  | 'not-declared'
  /** `batch:` はあるが中身が足りない。 */
  | 'bad-declaration'
  /** 表に中身の行が無い。 */
  | 'no-rows'
  /** 差し込もうとした列が表に無い。 */
  | 'no-column'
  /** 名前が空になる行がある。 */
  | 'empty-name'
  /** 同じ名前が 2 つできる。 */
  | 'duplicate-name'
  /** 行が多すぎる。 */
  | 'too-many';

export interface BatchProblem {
  kind: BatchProblemKind;
  /** 問題のもとになった文字列（列の名前・行の位置・重なった名前など）。 */
  raw: string;
}

export type ReadBatchSpecResult =
  | { ok: true; spec: BatchSpec }
  | { ok: false; problem: BatchProblem };

function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** 文書の frontmatter から一括の指定を読む。壊れた YAML でも投げない。 */
export function readBatchSpec(markdownSource: string): ReadBatchSpecResult {
  let data: Record<string, unknown>;
  try {
    data = splitFrontmatter(markdownSource).data as Record<string, unknown>;
  } catch {
    return { ok: false, problem: { kind: 'not-declared', raw: '' } };
  }
  const batch = data['batch'];
  if (batch === null || typeof batch !== 'object' || Array.isArray(batch)) {
    return { ok: false, problem: { kind: 'not-declared', raw: '' } };
  }
  const record = batch as Record<string, unknown>;
  const source = asText(record['source']);
  const name = asText(record['name']);
  if (source === '') {
    return { ok: false, problem: { kind: 'bad-declaration', raw: 'source' } };
  }
  if (name === '') {
    return { ok: false, problem: { kind: 'bad-declaration', raw: 'name' } };
  }
  return { ok: true, spec: { source, name } };
}

/** 1 枚ぶん。 */
export interface BatchItem {
  /** 出すファイルの名前（拡張子は付けない）。 */
  name: string;
  /** 差し込み後の本文。 */
  source: string;
}

export type BuildBatchResult =
  | { ok: true; items: BatchItem[] }
  | { ok: false; problem: BatchProblem };

/** 使われている列の名前を、出てきた順に返す。 */
function placeholders(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(PLACEHOLDER)) {
    const name = match[1];
    if (name !== undefined && !found.includes(name)) found.push(name);
  }
  return found;
}

function fill(text: string, values: Map<string, string>): string {
  return text.replace(PLACEHOLDER, (_whole, key: string) => values.get(key.trim()) ?? '');
}

/** 表を差し込んで枚数分に広げる。 */
export function buildBatch(
  markdownSource: string,
  spec: BatchSpec,
  tableText: string,
): BuildBatchResult {
  const table = parseDataTable(tableText);
  if (table.rows.length === 0) {
    return { ok: false, problem: { kind: 'no-rows', raw: spec.source } };
  }
  if (table.rows.length > MAX_BATCH_ITEMS) {
    return {
      ok: false,
      problem: { kind: 'too-many', raw: `${table.rows.length}/${MAX_BATCH_ITEMS}` },
    };
  }

  // 列の欠けは 1 行目を作る前に見る。無い列を空で埋めて出すと、
  // 抜けた分が「そういう内容」に見える。
  for (const key of [...placeholders(markdownSource), ...placeholders(spec.name)]) {
    if (!table.columns.includes(key)) {
      return { ok: false, problem: { kind: 'no-column', raw: key } };
    }
  }

  const items: BatchItem[] = [];
  const seen = new Set<string>();
  for (const [index, row] of table.rows.entries()) {
    const values = new Map<string, string>();
    table.columns.forEach((column, at) => values.set(column, row[at] ?? ''));
    const name = fill(spec.name, values).trim();
    if (name === '') {
      return { ok: false, problem: { kind: 'empty-name', raw: `${index + 1}` } };
    }
    if (seen.has(name)) {
      return { ok: false, problem: { kind: 'duplicate-name', raw: name } };
    }
    seen.add(name);
    items.push({ name, source: fill(markdownSource, values) });
  }
  return { ok: true, items };
}
