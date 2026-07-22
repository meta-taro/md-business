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
import { apiSpecSample } from '$lib/samples/apiSpecSample';
import { buildTree, type DocEntry, type TreeNode } from './fileTree';
import { initialExpandedPaths, toggleExpanded, computeDirty } from './workspaceLogic';

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
      this.truncated = result.truncated;
      this.error = null;
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
    } catch (e) {
      this.error = errorMessage(e);
    } finally {
      this.saving = false;
    }
  }
}

/** アプリ全体で 1 つの共有ワークスペース。 */
export const workspace = new WorkspaceStore();
