/**
 * 文書ワークスペースの共有 rune ストア（DOC-SPEC-DESKTOP-2026-0001 §2.1 / §4.1）。
 *
 * +layout の FileTree（左レール）と +page のエディター／プレビューは別コンポーネントで
 * ローカル状態を共有できない。両者の外側に本シングルトンを置き、ルート・ツリー・選択・
 * 読込済み source を一元管理する。Rust コマンド（scan_documents / read_document）と
 * dialog プラグインへのグルーはここに閉じ、遷移ロジックは workspaceLogic の純関数へ委譲する
 * （純関数側は vitest 単体テスト済み・§7.3）。
 */

import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { browser } from '$app/environment';
import { apiSpecSample } from '$lib/samples/apiSpecSample';
import { git } from '$lib/git/git.svelte';
import { diffView } from '$lib/git/diffView.svelte';
import { buildTree, type DocEntry, type TreeNode } from './fileTree';
import {
  initialExpandedPaths,
  toggleExpanded,
  computeDirty,
  shouldReopenFile,
} from './workspaceLogic';
import { parseStoredFolder } from './lastFolder';

/** 最後に開いたフォルダの localStorage キー（左レール幅等と同じ名前空間）。 */
const LAST_FOLDER_KEY = 'md-business:desktop:last-folder';

/** Rust `scan_documents` の戻り（serde camelCase）。 */
interface ScanResult {
  entries: DocEntry[];
  truncated: boolean;
}

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  return '不明なエラーが発生しました';
}

class WorkspaceStore {
  /** 選択中フォルダの絶対パス。未選択は null（空状態）。 */
  root = $state<string | null>(null);
  /** 走査結果を buildTree で入れ子化したツリー。 */
  tree = $state<TreeNode[]>([]);
  /** 展開中フォルダの path 集合。 */
  expanded = $state<Set<string>>(new Set());
  /** 選択中ファイルの相対パス。ハイライト用。 */
  activePath = $state<string | null>(null);
  /**
   * 開いているファイルが外部（AI/CLI/他エディタ）で変更されたが、こちらに未保存編集が
   * あって自動再読込できない状態。競合バナーの表示に使う。解消（再読込 or 編集維持）で null。
   */
  externalConflict = $state<{ relPath: string } | null>(null);
  /** 編集の唯一の真実。既定は seed テンプレ（ファイル未オープン時）。 */
  source = $state<string>(apiSpecSample);
  /** 直近にディスクへ反映された内容（read 直後 / save 成功時に同期）。dirty 判定の基準。 */
  savedSource = $state<string>(apiSpecSample);
  /** 保存中フラグ（多重 save 抑止・UI の保存インジケータ用）。 */
  saving = $state<boolean>(false);
  /** 走査が深さ / 件数上限で打ち切られたか（警告表示用）。 */
  truncated = $state<boolean>(false);
  /** 直近の走査 / 読込エラー（左レールに表示）。 */
  error = $state<string | null>(null);
  /** 走査中フラグ。 */
  loading = $state<boolean>(false);
  /**
   * ファイルを開いた回数。編集では増えない。+page はこれを依存にして「開いた瞬間だけ」
   * プレビューへ即反映する（タイプ中の debounce を壊さないため）。
   */
  loadSeq = $state<number>(0);

  /**
   * 起動時に「最後に開いたフォルダ」を復元する（+layout の onMount から 1 回呼ぶ）。
   * 未保存 / 既にオープン済みなら何もしない。復元先が消えている等で走査に失敗したら、
   * 記憶を消して初回エラーを出さず空状態に倒す（毎回選択に戻るだけ）。
   */
  async restoreLastFolder(): Promise<void> {
    if (!browser || this.root !== null) return;
    const last = parseStoredFolder(localStorage.getItem(LAST_FOLDER_KEY));
    if (last === null) return;
    await this.scan(last);
    if (this.root === null) {
      localStorage.removeItem(LAST_FOLDER_KEY);
      this.error = null;
    }
  }

  /** フォルダ選択ダイアログ → 走査。キャンセル時は何もしない。 */
  async openFolder(): Promise<void> {
    this.error = null;
    let selected: string | null;
    try {
      const picked = await open({ directory: true, multiple: false, title: 'フォルダを開く' });
      selected = typeof picked === 'string' ? picked : null;
    } catch (e) {
      this.error = errorMessage(e);
      return;
    }
    if (selected === null) return; // ユーザーがキャンセル
    await this.scan(selected);
  }

  /** ルート配下を走査し、ツリー・展開状態を更新する。 */
  private async scan(root: string): Promise<void> {
    this.loading = true;
    try {
      const result = await invoke<ScanResult>('scan_documents', { root });
      const tree = buildTree(result.entries);
      this.root = root;
      this.tree = tree;
      this.expanded = new Set(initialExpandedPaths(tree));
      this.activePath = null;
      // フォルダを開き直したら前フォルダの差分表示は無効。通常プレビューへ戻す。
      diffView.reset();
      this.truncated = result.truncated;
      this.error = null;
      // 次回起動で自動復元できるよう、開けたフォルダを記憶する（WebView の localStorage）。
      if (browser) localStorage.setItem(LAST_FOLDER_KEY, root);
      // 外部（AI/CLI/他エディタ）編集の即時検知を開始する。旧 watcher は Rust 側で張り替える
      // ので再走査でも安全。監視の失敗は起動をブロックしない（検知が来なくなるだけの劣化）。
      this.startWatch(root);
      // 開いたフォルダの git 状態とブランチ一覧を取得（非リポジトリでも無害・fire-and-forget）。
      void git.refresh(root);
      void git.loadBranches(root);
    } catch (e) {
      this.error = errorMessage(e);
    } finally {
      this.loading = false;
    }
  }

  /** フォルダの開閉トグル。 */
  toggle(path: string): void {
    this.expanded = toggleExpanded(this.expanded, path);
  }

  /** ツリー全体のファイル relPath を平坦に集める（切替後の再オープン判定用）。 */
  private allFilePaths(): string[] {
    const paths: string[] = [];
    const walk = (nodes: readonly TreeNode[]): void => {
      for (const node of nodes) {
        if (node.kind === 'file') paths.push(node.path);
        else walk(node.children);
      }
    };
    walk(this.tree);
    return paths;
  }

  /**
   * ブランチを切り替える（StatusBar の切替ポップオーバーから呼ぶ）。
   * git_switch は `-f` なしなので未コミット変更と衝突すると失敗し、例外が伝播する
   * （その場合ディスクは無変更＝呼び出し側でエラー表示する）。成功時はツリーを再走査し、
   * 直前に開いていたファイルが新ブランチにも在れば内容を読み直す。
   */
  async switchBranch(branch: string): Promise<void> {
    if (this.root === null) return;
    const prevActive = this.activePath;
    await git.switchBranch(this.root, branch); // 衝突時はここで throw（再走査しない）
    await this.scan(this.root); // ツリー再構築・activePath は null にリセットされる
    if (shouldReopenFile(prevActive, this.allFilePaths())) {
      // shouldReopenFile が true なら prevActive は非 null。
      await this.select(prevActive as string);
    }
  }

  /**
   * ルートの再帰監視を開始する（fire-and-forget）。監視の初期化失敗は握りつぶす：
   * 検知が届かなくなるだけで、手動で開き直せば従来どおり反映できる（既存機能は無影響）。
   */
  private startWatch(root: string): void {
    void invoke('watch_workspace', { root }).catch(() => undefined);
  }

  /**
   * 外部でツリー構造が変わった（作成・削除・リネーム）ときの再走査。
   * `scan` は activePath を null に戻すため、開いていたファイルを控えて再走査後に開き直す
   * （`switchBranch` と同じ `shouldReopenFile` 方式）。新ツリーに無ければ選択解除のまま。
   */
  async rescanPreservingActive(): Promise<void> {
    if (this.root === null) return;
    const prevActive = this.activePath;
    await this.scan(this.root);
    if (shouldReopenFile(prevActive, this.allFilePaths())) {
      // shouldReopenFile が true なら prevActive は非 null。
      await this.select(prevActive as string);
    }
  }

  /** 開いているファイルの外部変更を競合として記録する（編集中なので自動再読込しない）。 */
  flagConflict(relPath: string): void {
    this.externalConflict = { relPath };
  }

  /** 競合バナーの「再読込（編集を破棄）」。外部内容で開き直し、競合状態を解く。 */
  reloadConflict(): void {
    const conflict = this.externalConflict;
    this.externalConflict = null;
    if (conflict !== null) void this.select(conflict.relPath);
  }

  /** 競合バナーの「編集を残す」。再読込せず競合状態だけ解く（次の外部変更で再び出す）。 */
  dismissConflict(): void {
    this.externalConflict = null;
  }

  /** ファイルを読み込み source に反映する。失敗時はエラー表示のみ・前回内容を保持（§3.4）。 */
  async select(relPath: string): Promise<void> {
    if (this.root === null) return;
    try {
      const content = await invoke<string>('read_document', { root: this.root, relPath });
      this.source = content;
      this.savedSource = content; // 開いた直後は未編集（dirty=false）
      this.activePath = relPath;
      this.loadSeq += 1;
      this.error = null;
    } catch (e) {
      this.error = errorMessage(e);
    }
  }

  /** エディター / グリッド編集からの source 書き戻し。 */
  setSource(value: string): void {
    this.source = value;
  }

  /** 未保存編集があるか（保存ボタン活性・タイトルの dirty ドット用）。 */
  get dirty(): boolean {
    return computeDirty(this.activePath, this.source, this.savedSource);
  }

  /** 保存可能か（ファイルを開いていて、未保存差分があり、保存処理中でない）。 */
  get canSave(): boolean {
    return this.activePath !== null && this.dirty && !this.saving;
  }

  /**
   * 編集中 source を開いているファイルへ書き戻す。ファイル未オープン時・保存中は no-op。
   * 保存する内容は呼び出し時点で固定し、成功時に savedSource をそのスナップショットへ
   * 同期する（保存中にタイプが進んでも取りこぼさない）。失敗時はエラー表示のみ。
   */
  async save(): Promise<void> {
    if (this.root === null || this.activePath === null || this.saving) return;
    const relPath = this.activePath;
    const snapshot = this.source;
    this.saving = true;
    try {
      await invoke('write_document', { root: this.root, relPath, content: snapshot });
      this.savedSource = snapshot;
      this.error = null;
      // 保存でファイルの git 状態（modified など）が変わるので再取得する。
      void git.refresh(this.root);
    } catch (e) {
      this.error = errorMessage(e);
    } finally {
      this.saving = false;
    }
  }
}

/** アプリ全体で 1 つの共有ワークスペース。 */
export const workspace = new WorkspaceStore();
