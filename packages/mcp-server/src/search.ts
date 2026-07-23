/**
 * search_documents（Issue 004 Phase 2・P0）。
 * -----------------------------------------------------------------------------
 * DocumentStore 全走査で query（本文部分一致）／ schema id ／日付範囲を絞り込む。
 * 判定ロジックは純ヘルパへ分離して単体テストできるようにし、searchDocuments は
 * 「読む → 判定 → まとめる」の薄い統合に留める。fs には触れない。
 */
import { splitFrontmatter } from '@md-business/core';
import { detectSchemaId } from './registry.js';
import type { DocumentStore } from './store.js';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;

/** 検索対象の日付として拾う frontmatter キー（先頭優先）。 */
const DATE_KEYS = ['issueDate', 'date', 'updatedAt', 'createdAt', 'dueDate'] as const;

/** 空クエリは全ヒット。それ以外は大文字小文字を無視した部分一致。 */
export function matchesQuery(source: string, query: string | undefined): boolean {
  const q = (query ?? '').trim();
  if (q === '') return true;
  return source.toLowerCase().includes(q.toLowerCase());
}

/** 表示用タイトル。title → invoiceNumber → 本文先頭の Markdown 見出し → null。 */
export function extractTitle(frontmatter: Record<string, unknown>, body: string): string | null {
  const title = frontmatter['title'];
  if (typeof title === 'string' && title.trim() !== '') return title.trim();
  const invoiceNumber = frontmatter['invoiceNumber'];
  if (typeof invoiceNumber === 'string' && invoiceNumber.trim() !== '') return invoiceNumber.trim();
  for (const line of body.split('\n')) {
    const heading = /^#{1,6}\s+(.+)$/.exec(line.trim());
    if (heading) return heading[1]?.trim() ?? null;
  }
  return null;
}

/** 既知の日付キーから最初の ISO 日付（YYYY-MM-DD…）を拾う。無ければ null。 */
export function extractDate(frontmatter: Record<string, unknown>): string | null {
  for (const key of DATE_KEYS) {
    const raw = frontmatter[key];
    if (typeof raw === 'string' && ISO_DATE.test(raw.trim())) return raw.trim();
  }
  return null;
}

/**
 * 日付が [from, to]（両端含む）に入るか。範囲未指定の側は制約なし。
 * 範囲が指定されているのに日付が取れない文書は除外する。
 */
export function inDateRange(
  date: string | null,
  from: string | undefined,
  to: string | undefined,
): boolean {
  if (from === undefined && to === undefined) return true;
  if (date === null) return false;
  if (from !== undefined && date < from) return false;
  if (to !== undefined && date > to) return false;
  return true;
}

/** 本文の最初の非空行を抜粋（120 文字上限）。 */
export function makeExcerpt(body: string): string {
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (trimmed !== '') return trimmed.slice(0, 120);
  }
  return '';
}

export interface SearchQuery {
  /** 本文・frontmatter 全文に対する部分一致（未指定は全件）。 */
  query?: string;
  /** schema id で絞る（例 `invoice/v1`）。 */
  schema?: string;
  /** この日付以降（ISO・両端含む）。 */
  dateFrom?: string;
  /** この日付以前（ISO・両端含む）。 */
  dateTo?: string;
}

export interface SearchMatch {
  path: string;
  schema: string | null;
  title: string | null;
  date: string | null;
  excerpt: string;
}

export interface SearchDocumentsOk {
  ok: true;
  matches: SearchMatch[];
}

/** store 全体を走査し、query / schema / 日付範囲で絞った一致を path 昇順で返す。 */
export async function searchDocuments(
  store: DocumentStore,
  q: SearchQuery,
): Promise<SearchDocumentsOk> {
  const paths = await store.list();
  const matches: SearchMatch[] = [];
  for (const path of paths) {
    const src = await store.read(path);
    const { data, body } = splitFrontmatter(src);
    const schema = detectSchemaId(data);

    if (q.schema !== undefined && schema !== q.schema) continue;
    if (!matchesQuery(src, q.query)) continue;
    const date = extractDate(data);
    if (!inDateRange(date, q.dateFrom, q.dateTo)) continue;

    matches.push({ path, schema, title: extractTitle(data, body), date, excerpt: makeExcerpt(body) });
  }
  // store.list は既にソート済みだが、契約を searchDocuments 側でも明示しておく。
  matches.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { ok: true, matches };
}
