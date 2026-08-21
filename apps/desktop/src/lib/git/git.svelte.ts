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
import { coalesce } from './coalesce';
import {
  emptyGitStatus,
  buildStatusMap,
  lookupState,
  changeCount,
  type GitStatus,
  type GitFileState,
  type GitLogEntry,
} from './gitStatus';

class GitStore {
  /** 直近の git 状態。未オープン / 非リポジトリは emptyGitStatus。 */
  status = $state<GitStatus>(emptyGitStatus());

  /** ローカルブランチ名一覧（切替ポップオーバー用）。非リポジトリは空。 */
  branches = $state<string[]>([]);

  /** 直近のコミット一覧（新しい順）。未取得・非リポジトリは空。 */
  log = $state<GitLogEntry[]>([]);

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

  /**
   * root の git 状態を取得して反映する。失敗時は空へ（UI はマーク非表示）。
   *
   * 保存のたびに呼ばれるので、取得が終わる前に来た要求は 1 回へ畳む。畳まないと
   * 打っている間じゅう git の子プロセスが行列で残る。
   */
  refresh = coalesce(async (root: string): Promise<void> => {
    try {
      this.status = await invoke<GitStatus>('git_status', { root });
    } catch {
      // Rust 側は基本 Err を返さない（非リポジトリでも isRepo=false）。
      // 想定外の invoke 失敗時のみここへ来る。安全側で空へ倒す。
      this.status = emptyGitStatus();
    }
  });

  /** ローカルブランチ一覧を取得して反映する。失敗時は空（UI は切替不可表示）。 */
  async loadBranches(root: string): Promise<void> {
    try {
      this.branches = await invoke<string[]>('git_branches', { root });
    } catch {
      this.branches = [];
    }
  }

  /**
   * コミット履歴を取得して反映する。件数は Rust 側で既定・上限へ丸められる。
   *
   * 保存のたびに呼ぶ `refresh` からは呼ばない（毎回 git log を回すことになる）。
   * 履歴を出す画面を開いたときと、コミットした直後に読み直す。
   */
  async loadLog(root: string): Promise<void> {
    try {
      this.log = await invoke<GitLogEntry[]>('git_log', { root });
    } catch {
      // 非リポジトリ・git 未導入。履歴なしとして畳む（UI は空表示へ劣化）。
      this.log = [];
    }
  }

  /**
   * このフォルダを Git リポジトリにする（`git init`）。成功で最新ステータスを反映。
   * 既にリポジトリ・フォルダ無し・git 未導入は Rust の Err が例外として飛ぶので、
   * 呼び出し側で捕捉して提示する。リモートは設定しない（どこへ出すかは別の操作）。
   */
  async init(root: string): Promise<void> {
    this.status = await invoke<GitStatus>('git_init', { root });
  }

  /**
   * 空のフォルダへ、既にあるリポジトリを複製する（`git clone`）。成功で最新ステータスを反映。
   *
   * 資格情報はここでも Rust 側でも預からない。OS に預けてある資格情報が答えられなければ
   * 待たずに失敗する（尋ねる窓は出ない）。受け付けない複製元・空でないフォルダ・認証失敗は
   * Rust の Err が例外として飛ぶので、呼び出し側で捕捉して提示する。
   */
  async clone(root: string, url: string): Promise<void> {
    this.status = await invoke<GitStatus>('git_clone', { root, url });
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
   * いまのブランチから新しいブランチを作って切り替える（`git switch -c`）。
   * 既にある名前・不正な名前は Rust の Err が例外として飛ぶ。
   */
  async createBranch(root: string, branch: string): Promise<void> {
    this.status = await invoke<GitStatus>('git_switch_create', { root, branch });
  }

  /**
   * ステージしてコミットする（Rust 側で `git add` → `git commit -m`）。
   * `paths` 省略で全変更（`git add -A`）、指定するとその分だけ。
   * 成功で最新ステータスを反映。空メッセージ・ステージ後に変更なし等は Rust の Err が
   * 例外として飛ぶので、呼び出し側（StatusBar）で捕捉して stderr を提示する。
   */
  async commit(root: string, message: string, paths?: string[]): Promise<void> {
    this.status = await invoke<GitStatus>('git_commit', { root, message, paths });
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
    this.log = [];
  }
}

/** アプリ全体で 1 つの共有 git ストア。 */
export const git = new GitStore();
