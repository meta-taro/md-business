import yaml from 'js-yaml';

import { extractFrontmatter } from './frontmatterEdit.js';
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
