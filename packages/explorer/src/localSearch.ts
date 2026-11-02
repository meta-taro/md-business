import { baseName, fileKind, type FileKind } from './kind.js';
import { normalizeForSearch, normalizeWithOffsets, splitQuery } from './normalize.js';

export interface WorkspaceFile {
  path: string;
  /** 画像など本文を持たないものは省く */
  text?: string;
}

export type MatchedIn = 'name' | 'title' | 'body';

export interface WorkspaceHit {
  path: string;
  kind: FileKind;
  title: string | null;
  score: number;
  /** いちばん強く当たった場所 */
  matchedIn: MatchedIn;
  /** 本文でしか当たらなかったときの前後の抜粋 */
  snippet?: string;
}

/** 検索のたびに作り直さなくてよい部分。ファイルが変わったものだけ作り直せばよい。 */
export interface IndexedFile {
  path: string;
  kind: FileKind;
  title: string | null;
  /** 以下は検索用に揃えたもの */
  name: string;
  normTitle: string;
  body: string;
  /** 抜粋を切り出す元（先頭だけ） */
  text: string;
}

export interface SearchOptions {
  limit?: number;
}

const WEIGHT: Record<MatchedIn, number> = { name: 8, title: 6, body: 1 };
const DEFAULT_LIMIT = 50;
/** 巨大なファイル 1 本で一覧が固まらないよう、本文は先頭だけ見る */
const BODY_SCAN_LIMIT = 200_000;
const SNIPPET_BEFORE = 30;
const SNIPPET_AFTER = 60;

/** YAML の 1 行の値を素の文字列にする。複数行の値（`|` `>`）は 1 行の題名にならないので null。 */
function yamlScalar(value: string): string | null {
  const v = value.trim();
  if (v.startsWith('"') || v.startsWith("'")) {
    const q = v[0] ?? '';
    const close = v.indexOf(q, 1);
    return close > 0 ? v.slice(1, close).trim() || null : null;
  }
  if (v.startsWith('|') || v.startsWith('>')) return null;
  return v.replace(/\s+#.*$/, '').trim() || null;
}

function frontmatterTitle(lines: string[]): string | null {
  if (lines[0]?.trim() !== '---') return null;
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (line.trim() === '---') return null;
    const m = /^title:\s*(.+)$/.exec(line);
    if (m?.[1]) return yamlScalar(m[1]);
  }
  return null;
}

function firstHeading(lines: string[]): string | null {
  let fence: string | null = null;
  for (const line of lines) {
    const f = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (f?.[1]) {
      const mark = f[1];
      if (fence === null) fence = mark;
      else if (mark[0] === fence[0] && mark.length >= fence.length) fence = null;
      continue;
    }
    if (fence !== null) continue;
    const m = /^#\s+(.+?)\s*#*\s*$/.exec(line);
    if (m?.[1]) return m[1];
  }
  return null;
}

/** 一覧と検索で見せる題名。種別ごとの書き方から拾い、無ければ null。 */
export function titleOf(kind: FileKind, text: string): string | null {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  if (kind === 'markdown') return frontmatterTitle(lines) ?? firstHeading(lines);
  if (kind === 'tsv') {
    for (const line of lines) {
      if (!line.startsWith('#')) break;
      const m = /^#\s*タイトル\s*[:：]\s*(.+)$/.exec(line);
      if (m?.[1]) return m[1].trim();
    }
    return null;
  }
  if (kind === 'zumen' || kind === 'yaml') {
    for (const line of lines) {
      // 字下げの無い行だけ見る（入れ子の title は部品の名前）
      const m = /^title:\s*(.+)$/.exec(line);
      if (m?.[1]) return yamlScalar(m[1]);
    }
  }
  return null;
}

/** 拡張子を落とした名前。拡張子で当てると「md」で全部当たってしまう。 */
function stem(path: string, kind: FileKind): string {
  const name = baseName(path);
  if (kind === 'zumen') return name.replace(/\.zumen\.ya?ml$/i, '');
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

/** 検索の前処理。ファイルが変わらない限り使い回せる。 */
export function indexWorkspace(files: readonly WorkspaceFile[]): IndexedFile[] {
  return files.map((file) => {
    const kind = fileKind(file.path);
    const text = (file.text ?? '').slice(0, BODY_SCAN_LIMIT);
    const title = text ? titleOf(kind, text) : null;
    return {
      path: file.path,
      kind,
      title,
      name: normalizeForSearch(stem(file.path, kind)),
      normTitle: title ? normalizeForSearch(title) : '',
      body: text ? normalizeForSearch(text) : '',
      text,
    };
  });
}

function snippetAround(text: string, term: string): string {
  const { text: norm, offsets } = normalizeWithOffsets(text);
  const idx = norm.indexOf(term);
  const at = idx < 0 ? 0 : (offsets[idx] ?? 0);
  const matchEnd = idx < 0 ? 0 : (offsets[idx + term.length] ?? text.length);
  const start = Math.max(0, at - SNIPPET_BEFORE);
  const end = matchEnd + SNIPPET_AFTER;
  const body = text.slice(start, end).replace(/\s+/g, ' ').trim();
  return `${start > 0 ? '…' : ''}${body}${end < text.length ? '…' : ''}`;
}

function whereMatched(file: IndexedFile, term: string): MatchedIn | null {
  if (file.name.includes(term)) return 'name';
  if (file.normTitle.includes(term)) return 'title';
  if (file.body.includes(term)) return 'body';
  return null;
}

/** 前処理済みの索引を引く。語はすべて含むものだけ（AND）、名前 > 題名 > 本文 の順に重く数える。 */
export function searchIndex(index: readonly IndexedFile[], query: string, options: SearchOptions = {}): WorkspaceHit[] {
  const terms = splitQuery(query);
  if (terms.length === 0) return [];
  const hits: WorkspaceHit[] = [];

  for (const file of index) {
    let score = 0;
    let best: MatchedIn = 'body';
    let bodyOnlyTerm: string | null = null;
    let matchedAll = true;
    for (const term of terms) {
      const where = whereMatched(file, term);
      if (!where) {
        matchedAll = false;
        break;
      }
      score += WEIGHT[where];
      if (WEIGHT[where] > WEIGHT[best]) best = where;
      if (where === 'body' && bodyOnlyTerm === null) bodyOnlyTerm = term;
    }
    if (!matchedAll) continue;

    hits.push({
      path: file.path,
      kind: file.kind,
      title: file.title,
      score,
      matchedIn: best,
      ...(best === 'body' && bodyOnlyTerm !== null ? { snippet: snippetAround(file.text, bodyOnlyTerm) } : {}),
    });
  }

  // 同点は符号位置の順。localeCompare は実行環境の言語設定で並びが変わり、アプリごとに順が揃わない
  hits.sort((a, b) => b.score - a.score || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return hits.slice(0, options.limit ?? DEFAULT_LIMIT);
}

/**
 * ワークスペースの横断検索（前処理と検索をまとめて行う）。
 * ファイルを読むのは呼び出す側（アプリごとに読み方が違う）。
 */
export function searchWorkspace(
  files: readonly WorkspaceFile[],
  query: string,
  options: SearchOptions = {},
): WorkspaceHit[] {
  return searchIndex(indexWorkspace(files), query, options);
}
