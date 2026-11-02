/**
 * ワークスペースの横断検索（題名・本文）。ツリーの絞り込みは名前しか見ないので、その下に足す。
 *
 * 本文は 1 本ずつ読むしかない（走査は名前だけを返す）。フォルダが大きいと読み終わるまで
 * 時間がかかるので、本数・同時に読む数・1 本の長さに上限を置く。読んでいる間に走査し直したら、
 * 古い結果で索引を上書きしないよう途中でやめる。
 */
import { searchIndex, type IndexedFile, type WorkspaceFile, type WorkspaceHit } from '@md-business/explorer';
import type { DocEntry } from './fileTree';

/** 本文を読む種類。画像や JSON / XML は名前だけで当てる。 */
const TEXT_EXTS = new Set(['md', 'tsv']);

export interface ReadFilesOptions {
  /** 本文を読む本数の上限。超えた分は名前だけで当てる */
  maxReads?: number;
  /** 同時に読む本数 */
  concurrency?: number;
  /** 1 本あたり、索引に載せる文字数 */
  maxChars?: number;
  /** 走査し直したなどで、この結果が要らなくなったか */
  isStale?: () => boolean;
}

export interface ReadFilesResult {
  files: WorkspaceFile[];
  /** 本数の上限で、本文を読まなかったものがあるか */
  truncated: boolean;
}

const DEFAULT_MAX_READS = 3000;
const DEFAULT_CONCURRENCY = 4;
const DEFAULT_MAX_CHARS = 200_000;

/** 索引に載せるファイルを揃える。古くなったら null を返す。 */
export async function readFilesForIndex(
  entries: readonly DocEntry[],
  read: (relPath: string) => Promise<string>,
  options: ReadFilesOptions = {},
): Promise<ReadFilesResult | null> {
  const maxReads = options.maxReads ?? DEFAULT_MAX_READS;
  const concurrency = Math.max(1, options.concurrency ?? DEFAULT_CONCURRENCY);
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
  const isStale = options.isStale ?? (() => false);

  const files: WorkspaceFile[] = entries.map((e) => ({ path: e.relPath }));
  const targets = entries.flatMap((e, i) => (TEXT_EXTS.has(e.ext) ? [i] : []));
  const toRead = targets.slice(0, maxReads);
  let next = 0;
  let stopped = false;

  const worker = async (): Promise<void> => {
    while (!stopped && next < toRead.length) {
      const i = toRead[next++]!;
      try {
        const text = await read(files[i]!.path);
        files[i] = { path: files[i]!.path, text: text.length > maxChars ? text.slice(0, maxChars) : text };
      } catch {
        // 読めないものも名前では当たるよう、そのまま残す。
      }
      if (isStale()) stopped = true;
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, toRead.length) }, worker));

  if (stopped || isStale()) return null;
  return { files, truncated: targets.length > toRead.length };
}

/**
 * 題名・本文で当たったもの。名前の絞り込みでツリーにもう出ているものは重ねて出さない。
 */
export function contentHits(
  index: readonly IndexedFile[],
  query: string,
  shownInTree: ReadonlySet<string>,
  options: { limit?: number } = {},
): WorkspaceHit[] {
  const limit = options.limit ?? 30;
  // 除く分を見込んで多めに引いてから切る。
  return searchIndex(index, query, { limit: limit + shownInTree.size })
    .filter((h) => !shownInTree.has(h.path))
    .slice(0, limit);
}
