import yaml from 'js-yaml';

import { extractFrontmatter, replaceFrontmatter } from './frontmatterEdit.js';
import { parseRepoRef, type RepoRef } from './githubApi.js';

/**
 * シート ⇔ md ソースの紐付け（binding）まわりの純粋ロジック。
 * Why: UX 改修（Issue 006）で作業タブは textarea を持たず、セットアップ時に
 *      DocumentProperties へ保存した md ソースを正本として動く。保存キーの
 *      組み立てと、保存済みソースからの表示用サマリ抽出をテスト可能な層に閉じる。
 */

export interface BindingSummary {
  title: string;
  documentNumber: string;
  schema: string;
  repository: RepoRef | null;
}

const KEY_PREFIX = 'mdbusiness:src:';

export function bindingPropertyKey(sheetId: number): string {
  return `${KEY_PREFIX}${sheetId}`;
}

/**
 * 保存済み md ソースから作業タブ表示用のサマリを組み立てる。
 * schema バリデーションは通さない（保存時点で valid なものしか保存されない前提。
 * 表示目的なので、多少崩れたソースでも読める範囲で返し、読めなければ null）。
 * frontmatter キーは英語（templates 系）と日本語（sample.md 系）の両方を受ける。
 * repository キーは日本語版 frontmatter でも英語のまま（sample.md 準拠）。
 */
export function buildBindingSummary(src: string): BindingSummary | null {
  if (typeof src !== 'string' || src.length === 0) return null;
  const { yaml: yamlStr } = extractFrontmatter(src);
  if (yamlStr.trim().length === 0) return null;

  let parsed: unknown;
  try {
    parsed = yaml.load(yamlStr, { schema: yaml.JSON_SCHEMA });
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null;
  }
  const data = parsed as Record<string, unknown>;

  const repoRaw = data.repository;
  return {
    title: pickString(data, 'title', 'タイトル'),
    documentNumber: pickString(data, 'documentNumber', '文書番号'),
    schema: pickString(data, 'schema', 'スキーマ'),
    repository: typeof repoRaw === 'string' ? parseRepoRef(repoRaw) : null,
  };
}

function pickString(data: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === 'string') return value;
  }
  return '';
}

/**
 * ヘッダーを除いた getValues() の結果から「記入済み行数」を数える。
 * Why: getLastRow() はテンプレセットアップで流し込んだ checkbox の false や
 *      データバリデーションの範囲まで拾い、実機で「全 999 項目」と誤表示した。
 *      false と空文字（空白のみ含む）は未記入として扱う。
 */
export function countFilledRows(values: ReadonlyArray<ReadonlyArray<unknown>>): number {
  let count = 0;
  for (const row of values) {
    if (row.some(isFilledCell)) count += 1;
  }
  return count;
}

function isFilledCell(cell: unknown): boolean {
  if (typeof cell === 'string') return cell.trim().length > 0;
  if (typeof cell === 'number') return true;
  if (typeof cell === 'boolean') return cell;
  return cell !== null && cell !== undefined;
}

export type UpsertRepositoryResult =
  | { ok: true; newSrc: string; repo: RepoRef }
  | { ok: false; error: string };

/**
 * 保存済み md ソースの frontmatter に repository 行を追加・置換する。
 * Why: テンプレートから作った直後は保存先が未設定で、旧動線は「上級者向けで
 *      設計データを直接編集」しかなかった。設定タブの保存先カードから 1 入力で
 *      設定できるようにするためのロジック層。YAML を round-trip すると
 *      コメント・書式が壊れるため、行単位のテキスト操作で frontmatter を保つ。
 */
export function upsertRepositoryField(src: string, repoInput: string): UpsertRepositoryResult {
  const repo = parseRepoRef(repoInput);
  if (!repo) {
    return {
      ok: false,
      error:
        '保存先の形式が正しくありません。owner/repo@branch:path の形で入力してください（例: meta-taro/md-business@main:docs/test-spec/sample.md）。',
    };
  }
  const { yaml: yamlStr } = extractFrontmatter(src);
  if (yamlStr.trim().length === 0) {
    return { ok: false, error: '設計データに frontmatter がありません。' };
  }

  const canonical = `repository: ${repo.owner}/${repo.repo}@${repo.branch}:${repo.path}`;
  const lines = yamlStr.split('\n');
  const repoIndex = lines.findIndex((line) => /^repository:\s/.test(line));
  const hintIndex = lines.findIndex((line) => /^#\s*repository:/.test(line));
  if (repoIndex >= 0) {
    lines[repoIndex] = canonical;
  } else if (hintIndex >= 0) {
    lines[hintIndex] = canonical;
  } else {
    const schemaIndex = lines.findIndex((line) => /^(schema|スキーマ):/.test(line));
    lines.splice(schemaIndex >= 0 ? schemaIndex + 1 : 0, 0, canonical);
  }
  return { ok: true, newSrc: replaceFrontmatter(src, lines.join('\n')), repo };
}
