/**
 * Git 状態の型と純ロジック（DESIGN 後続フェーズ 3「Git・フォージ」）。
 *
 * Rust `git_status` コマンドの戻り（serde camelCase）をそのまま受ける型と、UI が使う
 * 導出（パス突き合わせ・変更数・マーク文字・フォージ表示名）を Tauri 非依存の純関数に置く。
 * 副作用（invoke）は git.svelte.ts のストアに閉じ、ここは vitest で単体テストする（§7.3）。
 */

/** 色マークの意味カテゴリ（Rust git.rs classify_xy と対応）。 */
export type GitFileState =
  | 'modified'
  | 'added'
  | 'untracked'
  | 'deleted'
  | 'renamed'
  | 'conflicted';

/** 1 ファイルの変更状態。relPath は **リポジトリ root 基準**。 */
export interface GitFileStatus {
  relPath: string;
  state: GitFileState;
}

/** Rust GitStatus のミラー。files/prefix は repo root 基準・prefix は開いたフォルダへの相対。 */
export interface GitStatus {
  isRepo: boolean;
  branch: string | null;
  ahead: number;
  behind: number;
  files: GitFileStatus[];
  forge: string | null;
  /** repo root → 開いたフォルダ の相対パス（"/"-終端 or 空）。ツリー行との突き合わせに足す。 */
  prefix: string;
}

/** 非リポジトリ（未オープン / git 取得失敗）時の既定ステータス。 */
export function emptyGitStatus(): GitStatus {
  return {
    isRepo: false,
    branch: null,
    ahead: 0,
    behind: 0,
    files: [],
    forge: null,
    prefix: '',
  };
}

/** files を relPath（repo root 基準）→ state の Map にする。 */
export function buildStatusMap(status: GitStatus): Map<string, GitFileState> {
  const map = new Map<string, GitFileState>();
  for (const file of status.files) {
    map.set(file.relPath, file.state);
  }
  return map;
}

/**
 * ツリー行（開いたフォルダ基準の relPath）の git 状態を引く。
 * git の Map は repo root 基準キーなので prefix を足して照合する。該当なしは null。
 */
export function lookupState(
  map: Map<string, GitFileState>,
  prefix: string,
  treeRelPath: string,
): GitFileState | null {
  return map.get(prefix + treeRelPath) ?? null;
}

/** 変更のあるファイル数（StatusBar の「変更 N」）。 */
export function changeCount(status: GitStatus): number {
  return status.files.length;
}

/** 状態 → VSCode 風の 1 文字バッジ。 */
const MARK_LETTER: Record<GitFileState, string> = {
  modified: 'M',
  added: 'A',
  untracked: 'U',
  deleted: 'D',
  renamed: 'R',
  conflicted: 'C',
};

/** 状態の頭文字（ファイルツリーの右肩バッジ）。 */
export function gitMarkLetter(state: GitFileState): string {
  return MARK_LETTER[state];
}

/**
 * git status のパス（repo root 基準）を、開いたフォルダ基準のツリー相対パスへ逆変換する。
 * `prefix` は repo root → 開いたフォルダの相対（"/"-終端 or 空・lookupState と対）。
 * repoRelPath がその配下なら prefix を剥がして返す。配下でない（別サブツリーの変更）なら
 * null＝そのファイルは開いたフォルダに無く、エディターで開けない（差分だけ見せる）。
 */
export function toTreeRelPath(prefix: string, repoRelPath: string): string | null {
  if (prefix === '') return repoRelPath;
  if (repoRelPath.startsWith(prefix)) return repoRelPath.slice(prefix.length);
  return null;
}

/** フォージ種別 → StatusBar 表示名。未知・null は「未判定」。 */
export function forgeLabel(forge: string | null): string {
  switch (forge) {
    case 'github':
      return 'GitHub';
    case 'gitlab':
      return 'GitLab';
    case 'bitbucket':
      return 'Bitbucket';
    case 'other':
      return 'Git';
    default:
      return '未判定';
  }
}
