/**
 * 1 行 1 レコードのログ（JSONL / TSV）を 1 件ずつ読み出す層。
 * -----------------------------------------------------------------------------
 * filter_records と aggregate が同じ読み方をするための共通部分。決めごとは 3 つ。
 *
 * 1. **全文をメモリに載せない**。store.lines で 1 行ずつ流す
 * 2. **読めない行で止まらない**。壊れた行は数えて飛ばす。例外にして全部を失わない
 * 3. **形式を推測しない**。拡張子で判らなければ呼び出し側に指定させる
 */
import { unescapeCell } from '@md-business/schema-test-spec-tsv';
import type { DocumentStore } from './store.js';

/** 検証シートであることを示す 1 行目のマーカー（行頭 0 桁）。 */
const TEST_SPEC_MARKER = '#! md-business:test-spec-tsv/v1';

/** 読める形式。拡張子から判らないときは呼び出し側が指定する。 */
export type RecordFormat = 'jsonl' | 'tsv';

export interface SourceRecord {
  /** 1 始まりの行番号（元ファイルの物理行）。 */
  line: number;
  record: Record<string, unknown>;
}

/** 読み取りの途中経過。呼び出し側が用意し、読みながら書き足される。 */
export interface ReadStats {
  /** レコードとして読めなかった行数（空行・`#` 行は数えない）。 */
  skipped: number;
  /** 読んだ行数。 */
  scannedLines: number;
}

/** 拡張子から形式を決める。判らなければ undefined（推測しない）。 */
export function formatFromPath(relative: string): RecordFormat | undefined {
  const lower = relative.toLowerCase();
  if (lower.endsWith('.jsonl') || lower.endsWith('.ndjson')) return 'jsonl';
  if (lower.endsWith('.tsv')) return 'tsv';
  return undefined;
}

/** 入れ子を `.` で辿る。無ければ undefined。 */
export function pick(record: unknown, field: string): unknown {
  let node: unknown = record;
  for (const key of field.split('.')) {
    if (node === null || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[key];
  }
  return node;
}

/** 比較・表示に使う文字列。無い項目は undefined（「空文字」と区別する）。 */
export function toText(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'string') return value;
  if (value === null) return 'null';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value) ?? undefined;
}

/** TSV の見出しを列名の配列にする。空の見出しは列番号で埋める。 */
function headerNames(cells: string[]): string[] {
  return cells.map((cell, index) => (cell === '' ? `column ${index + 1}` : cell));
}

/**
 * レコードを 1 件ずつ返す。読めなかった行は stats.skipped に数えて飛ばす。
 */
export async function* readRecords(
  store: DocumentStore,
  relative: string,
  format: RecordFormat,
  stats: ReadStats,
): AsyncGenerator<SourceRecord> {
  /** TSV の見出し（最初のレコード行より前に決まる）。 */
  let header: string[] | undefined;
  /** 検証シート形式なら、セルのエスケープを戻してから扱う。 */
  let unescape = false;

  for await (const raw of store.lines(relative)) {
    stats.scannedLines += 1;

    if (format === 'jsonl') {
      if (raw.trim() === '') continue;
      let record: Record<string, unknown> | undefined;
      try {
        const parsed: unknown = JSON.parse(raw);
        // 配列や数値の行は「1 行 1 レコード」ではないので、読めなかった側に数える。
        if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
          record = parsed as Record<string, unknown>;
        }
      } catch {
        record = undefined;
      }
      if (record === undefined) {
        stats.skipped += 1;
        continue;
      }
      yield { line: stats.scannedLines, record };
      continue;
    }

    if (stats.scannedLines === 1 && raw.startsWith(TEST_SPEC_MARKER)) unescape = true;
    if (raw.trim() === '' || raw.startsWith('#')) continue;
    const cells = raw.split('\t').map((cell) => (unescape ? unescapeCell(cell) : cell));
    if (header === undefined) {
      header = headerNames(cells);
      continue;
    }
    const row: Record<string, unknown> = {};
    cells.forEach((cell, index) => {
      row[header?.[index] ?? `column ${index + 1}`] = cell;
    });
    yield { line: stats.scannedLines, record: row };
  }
}
