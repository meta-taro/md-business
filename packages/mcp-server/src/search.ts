/**
 * search_documents。
 * -----------------------------------------------------------------------------
 * DocumentStore 全走査で query（本文部分一致）／ schema id ／日付範囲を絞り込む。
 * 文書（Markdown）に加えて検証シート（TSV）も返す。シートの一覧が取れないと、
 * エージェントはパスを教わるまで検証シート用のツールを呼べないため。
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

/** 検証シートの見出しとして扱うメタ行のキー（大文字小文字は無視）。 */
const SHEET_TITLE_KEYS = ['タイトル', 'title'];

export interface SheetSummary {
  /** メタ行から拾った見出し。無ければ null。 */
  title: string | null;
  /** 一覧に添える 1 行（先頭のメタ行）。無ければ空文字。 */
  excerpt: string;
}

/**
 * 検証シート（TSV）の冒頭メタ行から、一覧に出す見出しと抜粋を取り出す。
 *
 * メタ行のキーは利用者が決めるので、見出しに使えるのは慣習的な「タイトル」だけ。
 * 全体を解析すると 1 件ずつが重くなるため、冒頭の `#` 行だけを見る。
 */
export function summarizeSheet(source: string): SheetSummary {
  let title: string | null = null;
  let excerpt = '';
  for (const raw of source.split('\n')) {
    const line = raw.trim();
    // `#!` はフォーマット識別、`#@` は表示指定。どちらも文書の内容ではない。
    if (line.startsWith('#!') || line.startsWith('#@')) continue;
    if (!line.startsWith('#')) break; // メタ行はファイル先頭に固まっている。
    const content = line.slice(1).trim();
    if (content === '') continue;
    if (excerpt === '') excerpt = content.slice(0, 120);
    const separator = content.indexOf(':');
    if (separator === -1) continue;
    const key = content.slice(0, separator).trim().toLowerCase();
    if (title === null && SHEET_TITLE_KEYS.includes(key)) {
      const value = content.slice(separator + 1).trim();
      if (value !== '') title = value;
    }
  }
  return { title, excerpt };
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
  /** 文書（Markdown）か検証シート（TSV）か。読み書きに使うツールが変わる。 */
  kind: 'document' | 'sheet';
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

    matches.push({
      path,
      kind: 'document',
      schema,
      title: extractTitle(data, body),
      date,
      excerpt: makeExcerpt(body),
    });
  }

  // 検証シートは schema 宣言も日付も持たない。絞り込みが指定されたときは意図に合わないので外す。
  const wantsSheets =
    q.schema === undefined && q.dateFrom === undefined && q.dateTo === undefined;
  if (wantsSheets) {
    for (const path of await store.listSheets()) {
      const src = await store.read(path);
      if (!matchesQuery(src, q.query)) continue;
      const summary = summarizeSheet(src);
      matches.push({
        path,
        kind: 'sheet',
        schema: null,
        title: summary.title,
        date: null,
        excerpt: summary.excerpt,
      });
    }
  }
  // 文書とシートを別々に集めるので、返す前に 1 本の並びへ揃える。
  matches.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { ok: true, matches };
}
