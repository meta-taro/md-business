/**
 * Git 状態の共有 rune ストア（DESIGN 後続フェーズ 3「Git・フォージ」）。
 *
 * FileTree（色マーク）と StatusBar（ブランチ / 変更数 / フォージ）は別コンポーネントで
 * 状態を共有できないため、両者の外側に本シングルトンを置く。Rust `git_status` コマンドの
 * invoke はここに閉じ、突き合わせ・導出は gitStatus.ts の純関数へ委譲する（単体テスト済み）。
 *
 * 更新契機はワークスペース側（フォルダを開いた直後・保存成功後）から `refresh(root)` を呼ぶ。
 * git 未導入・非リポジトリでも Rust 側が isRepo=false を返すため、UI はマーク非表示で劣化する。
 */

import { invoke } from '@tauri-apps/api/core';
import {
  emptyGitStatus,
  buildStatusMap,
  lookupState,
  changeCount,
  type GitStatus,
  type GitFileState,
} from './gitStatus';

class GitStore {
  /** 直近の git 状態。未オープン / 非リポジトリは emptyGitStatus。 */
  status = $state<GitStatus>(emptyGitStatus());

  /** ローカルブランチ名一覧（切替ポップオーバー用）。非リポジトリは空。 */
  branches = $state<string[]>([]);

  /** files を relPath（repo root 基準）→ state に索引化。ツリー照合の O(1) 化。 */
  private statusMap = $derived(buildStatusMap(this.status));

  /** git リポジトリ配下か（StatusBar の接続表示切替）。 */
  get isRepo(): boolean {
    return this.status.isRepo;
  }

  /** 現在ブランチ（detached / 非リポジトリは null）。 */
  get branch(): string | null {
    return this.status.branch;
  }

  get ahead(): number {
    return this.status.ahead;
  }

  get behind(): number {
    return this.status.behind;
  }

  /** 変更ファイル数（リポジトリ全体・repo root 基準）。 */
  get changeCount(): number {
    return changeCount(this.status);
  }

  /** フォージ種別（"github" 等 / 未判定は null）。 */
  get forge(): string | null {
    return this.status.forge;
  }

  /**
   * ツリー行（開いたフォルダ基準の relPath）の git 状態を引く。該当なしは null。
   * prefix を足して repo root 基準キーへ揃える（サブディレクトリを開いた場合の整合）。
   */
  stateOf(treeRelPath: string): GitFileState | null {
    return lookupState(this.statusMap, this.status.prefix, treeRelPath);
  }

  /** root の git 状態を取得して反映する。失敗時は空へ（UI はマーク非表示）。 */
  async refresh(root: string): Promise<void> {
    try {
      this.status = await invoke<GitStatus>('git_status', { root });
    } catch {
      // Rust 側は基本 Err を返さない（非リポジトリでも isRepo=false）。
      // 想定外の invoke 失敗時のみここへ来る。安全側で空へ倒す。
      this.status = emptyGitStatus();
    }
  }

  /** ローカルブランチ一覧を取得して反映する。失敗時は空（UI は切替不可表示）。 */
  async loadBranches(root: string): Promise<void> {
    try {
      this.branches = await invoke<string[]>('git_branches', { root });
    } catch {
      this.branches = [];
    }
  }

  /**
   * ブランチを切り替え、返却された最新ステータスを反映する。
   * 失敗（未コミット変更との衝突・不明ブランチ）は Rust の Err が例外として飛ぶので、
   * 呼び出し側（workspace / StatusBar）で捕捉してユーザーへ表示する。
   */
  async switchBranch(root: string, branch: string): Promise<void> {
    this.status = await invoke<GitStatus>('git_switch', { root, branch });
  }

  /**
   * 全変更をステージしてコミットする（Rust 側で `git add -A` → `git commit -m`）。
   * 成功で最新ステータスを反映。空メッセージ・ステージ後に変更なし等は Rust の Err が
   * 例外として飛ぶので、呼び出し側（StatusBar）で捕捉して stderr を提示する。
   */
  async commit(root: string, message: string): Promise<void> {
    this.status = await invoke<GitStatus>('git_commit', { root, message });
  }

  /**
   * upstream へ push する（Rust 側で `git push`・`--force` なし）。成功で ahead が解消。
   * 認証は OS の git 資格情報に委ねる（アプリは資格情報を扱わない）。upstream 未設定・
   * 認証失敗・非 ff 拒否は Err が例外として飛ぶので、呼び出し側で捕捉して提示する。
   */
  async push(root: string): Promise<void> {
    this.status = await invoke<GitStatus>('git_push', { root });
  }

  /**
   * upstream から pull する（Rust 側で `git pull --ff-only`）。成功で behind が解消。
   * 履歴分岐時は fast-forward 不可で失敗＝作業ツリーを触らず Err が例外として飛ぶ。
   */
  async pull(root: string): Promise<void> {
    this.status = await invoke<GitStatus>('git_pull', { root });
  }

  /** フォルダを閉じた / 未オープンへ戻すときに状態を空へ。 */
  reset(): void {
    this.status = emptyGitStatus();
    this.branches = [];
  }
}

/** アプリ全体で 1 つの共有 git ストア。 */
export const git = new GitStore();
