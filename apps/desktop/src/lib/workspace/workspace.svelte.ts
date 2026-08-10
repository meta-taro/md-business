/**
 * 文書ワークスペースの共有 rune ストア（設計は docs/specs/DOC-SPEC-desktop-file-tree.md）。
 *
 * +layout の FileTree（左レール）と +page のエディター／プレビューは別コンポーネントで
 * ローカル状態を共有できない。両者の外側に本シングルトンを置き、ルート・ツリー・選択・
 * 読込済み source を一元管理する。Rust コマンド（scan_documents / read_document）と
 * dialog プラグインへのグルーはここに閉じ、遷移ロジックは workspaceLogic の純関数へ委譲する
 * （純関数側は vitest 単体テスト済み）。
 */

import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { browser } from '$app/environment';
import { apiSpecSample } from '$lib/samples/apiSpecSample';
import { git } from '$lib/git/git.svelte';
import { perf } from '$lib/diagnostics/perf.svelte';
import { diffView } from '$lib/git/diffView.svelte';
import { buildTree, type DocEntry, type TreeNode } from './fileTree';
import {
  initialExpandedPaths,
  toggleExpanded,
  computeDirty,
  collectFolderPaths,
  shouldReopenFile,
  remapRenamedPath,
  withAncestorsExpanded,
} from './workspaceLogic';
import { parseStoredFolder } from './lastFolder';
import {
  forgetTreeState,
  hasRestoredView,
  parseTreeStates,
  pickTreeState,
  rememberTreeState,
  restoreExpanded,
  serializeTreeStates,
  type TreeViewState,
} from './treeState';
import {
  addRecentFolder,
  removeRecentFolder,
  restoreRecentFolders,
  serializeRecentFolders,
} from './recentFolders';

/** 最後に開いたフォルダの localStorage キー（左レール幅等と同じ名前空間）。 */
const LAST_FOLDER_KEY = 'md-business:desktop:last-folder';

/** 過去に開いたフォルダ一覧の localStorage キー。 */
const RECENT_FOLDERS_KEY = 'md-business:desktop:recent-folders';

/** フォルダごとのツリー表示状態（展開・開いていたファイル）の localStorage キー。 */
const TREE_STATES_KEY = 'md-business:desktop:tree-states';

/** 「前回の続きから開いた」知らせを出しておく時間。読めば用が済むので短く消す。 */
const RESTORED_NOTICE_MS = 6000;

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
  /**
   * 最後に保存できた時刻（未保存なら null）。
   * 自動保存は静止後に黙って走るため、効いていることを時刻で見せる。
   */
  savedAt = $state<Date | null>(null);
  /** 走査が深さ / 件数上限で打ち切られたか（警告表示用）。 */
  truncated = $state<boolean>(false);
  /** 直近の走査 / 読込エラー（左レールに表示）。 */
  error = $state<string | null>(null);
  /** 走査中フラグ。 */
  loading = $state<boolean>(false);
  /** 過去に開いたフォルダ（最近開いた順）。空状態からの再オープンに使う。 */
  recent = $state<string[]>([]);
  /**
   * 履歴のうち、今は開けないと分かっているフォルダ。移動・削除・共有ドライブの切断で起きる。
   * 履歴からは消さず印だけ付ける（切断が一時的なら、繋ぎ直せばそのまま使えるため）。
   */
  missingRecent = $state<Set<string>>(new Set());
  /**
   * ファイルを開いた回数。編集では増えない。+page はこれを依存にして「開いた瞬間だけ」
   * プレビューへ即反映する（タイプ中の debounce を壊さないため）。
   */
  loadSeq = $state<number>(0);
  /**
   * 直前に開いたフォルダを記憶から復元できたか。黙って戻すと、覚えていること自体に
   * 気付けない（勝手に開いたように見える）ので、戻せた時だけ画面で一度知らせる。
   */
  restored = $state<boolean>(false);
  /**
   * フォルダごとのツリー表示状態（展開・開いていたファイル）。画面が読むのは復元先の
   * `expanded` / `activePath` 自身なので、ここは反応状態にしない。
   * 初回参照時に localStorage から読む（+layout の呼び出し順に依存させないため）。
   */
  private treeStates: TreeViewState[] | null = null;
  /** 復元の知らせを自動で消すタイマー。 */
  private restoredTimer: ReturnType<typeof setTimeout> | null = null;

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

  /**
   * 過去に開いたフォルダ一覧を復元し、各フォルダが今も開けるかを確かめる（onMount から 1 回）。
   * 存在確認は一覧表示より遅れて届いてよいので、待たずに走らせる。
   */
  loadRecent(): void {
    if (!browser) return;
    this.recent = restoreRecentFolders(
      localStorage.getItem(RECENT_FOLDERS_KEY),
      parseStoredFolder(localStorage.getItem(LAST_FOLDER_KEY)),
    );
    void this.checkRecent();
  }

  /** 履歴の各フォルダが今も開けるかを確かめ、開けないものへ印を付ける。 */
  private async checkRecent(): Promise<void> {
    const targets = this.recent;
    const results = await Promise.all(
      targets.map(async (path) => {
        try {
          return { path, exists: await invoke<boolean>('directory_exists', { path }) };
        } catch {
          // 確認自体に失敗した場合は「消えた」と決めつけない（印を付けず開かせてみる）。
          return { path, exists: true };
        }
      }),
    );
    this.missingRecent = new Set(results.filter((r) => !r.exists).map((r) => r.path));
  }

  /** 「開けない」印を落とす（開けた・履歴から消した時）。 */
  private unmarkMissing(path: string): void {
    if (!this.missingRecent.has(path)) return;
    const next = new Set(this.missingRecent);
    next.delete(path);
    this.missingRecent = next;
  }

  /** 記憶済みのツリー表示状態（初回だけ localStorage から読む）。 */
  private viewStates(): TreeViewState[] {
    if (this.treeStates === null) {
      this.treeStates = browser ? parseTreeStates(localStorage.getItem(TREE_STATES_KEY)) : [];
    }
    return this.treeStates;
  }

  /** ツリー表示状態を localStorage へ書き戻す。 */
  private persistViewStates(states: TreeViewState[]): void {
    this.treeStates = states;
    if (browser) localStorage.setItem(TREE_STATES_KEY, serializeTreeStates(states));
  }

  /**
   * 今の展開・選択を、開いているフォルダの記憶として書き戻す。
   * 開閉・ファイル選択のたびに呼ぶ（アプリを落とすタイミングは掴めないので、その都度残す）。
   */
  private persistView(): void {
    if (this.root === null) return;
    this.persistViewStates(
      rememberTreeState(this.viewStates(), {
        root: this.root,
        expanded: [...this.expanded],
        active: this.activePath,
      }),
    );
  }

  /**
   * 復元したことを一度だけ知らせる。読めば用の済む知らせなので、しばらくして自分で消える
   * （閉じる操作を増やさない）。
   */
  private noticeRestored(on: boolean): void {
    if (this.restoredTimer !== null) clearTimeout(this.restoredTimer);
    this.restoredTimer = null;
    this.restored = on;
    if (!on || !browser) return;
    this.restoredTimer = setTimeout(() => {
      this.restored = false;
      this.restoredTimer = null;
    }, RESTORED_NOTICE_MS);
  }

  /**
   * 履歴の行に添える「前回そのフォルダで開いていたファイル」（記憶が無ければ null）。
   * 開く前に何を触っていたかが分かると、同名フォルダの選び分けにも使える。
   */
  rememberedFile(root: string): string | null {
    return pickTreeState(this.viewStates(), root)?.active ?? null;
  }

  /** 履歴を localStorage へ書き戻す。 */
  private persistRecent(): void {
    if (browser) localStorage.setItem(RECENT_FOLDERS_KEY, serializeRecentFolders(this.recent));
  }

  /**
   * 履歴から選んで開く。開く直前に存在を確かめ、消えていれば印を付けて走査しない
   * （走査の失敗メッセージより、一覧上で消えていると分かるほうが直しやすい）。
   */
  async openRecent(path: string): Promise<void> {
    this.error = null;
    let exists = true;
    try {
      exists = await invoke<boolean>('directory_exists', { path });
    } catch {
      exists = true; // 確認できないだけなら、そのまま開いてみる
    }
    if (!exists) {
      this.missingRecent = new Set([...this.missingRecent, path]);
      return;
    }
    this.unmarkMissing(path);
    await this.scan(path);
  }

  /** 履歴から取り除く（一覧の × 印）。開いているフォルダ自体には触れない。 */
  forgetRecent(path: string): void {
    this.recent = removeRecentFolder(this.recent, path);
    this.unmarkMissing(path);
    this.persistRecent();
    // 一覧から消したフォルダの表示状態も残さない（もう開く手段が無いものを溜めない）。
    this.persistViewStates(forgetTreeState(this.viewStates(), path));
    // 最後に開いたフォルダを忘れさせたなら、次回起動で復元しないよう記憶も消す。
    if (browser && parseStoredFolder(localStorage.getItem(LAST_FOLDER_KEY)) === path) {
      localStorage.removeItem(LAST_FOLDER_KEY);
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
    // 前のフォルダで出した知らせを持ち越さない（失敗して開けなかった場合も含む）。
    this.noticeRestored(false);
    try {
      const result = await invoke<ScanResult>('scan_documents', { root });
      const tree = buildTree(result.entries);
      // 同じフォルダを取り直しただけ（保存・改名・ブランチ切替）なら今の見え方を保つ。
      // 別のフォルダへ移るときだけ、そのフォルダの記憶（初めてなら既定）から組み立て直す。
      const sameRoot = this.root === root;
      const remembered = sameRoot ? null : pickTreeState(this.viewStates(), root);
      const keep = sameRoot ? [...this.expanded] : (remembered?.expanded ?? null);
      this.root = root;
      this.tree = tree;
      this.expanded = new Set(
        restoreExpanded(keep, collectFolderPaths(tree), initialExpandedPaths(tree)),
      );
      this.activePath = null;
      // フォルダを開き直したら前フォルダの差分表示は無効。通常プレビューへ戻す。
      diffView.reset();
      this.truncated = result.truncated;
      this.error = null;
      // 次回起動で自動復元できるよう、開けたフォルダを記憶する（WebView の localStorage）。
      if (browser) localStorage.setItem(LAST_FOLDER_KEY, root);
      // 開けたフォルダは履歴の先頭へ。開けた直後なので「消えた」印は落とす。
      this.recent = addRecentFolder(this.recent, root);
      this.unmarkMissing(root);
      this.persistRecent();
      // 外部（AI/CLI/他エディタ）編集の即時検知を開始する。旧 watcher は Rust 側で張り替える
      // ので再走査でも安全。監視の失敗は起動をブロックしない（検知が来なくなるだけの劣化）。
      this.startWatch(root);
      // 組み込み MCP サーバーの作業対象も同じフォルダへ揃える（未起動なら何も起きない）。
      this.syncMcpRoot(root);
      // 開いたフォルダの git 状態とブランチ一覧を取得（非リポジトリでも無害・fire-and-forget）。
      void git.refresh(root);
      void git.loadBranches(root);
      // 別のフォルダへ移ったときは、前回そこで開いていたファイルを開き直す。
      // 同じフォルダの取り直しは、呼び出し元が自前で開き直す（改名なら新しいパスで開く等）。
      const rememberedActive = remembered?.active ?? null;
      if (shouldReopenFile(rememberedActive, this.allFilePaths())) {
        // shouldReopenFile が true なら rememberedActive は非 null。
        await this.select(rememberedActive as string);
      }
      // 記憶から戻せたときだけ知らせる（同じフォルダの取り直しでは何も復元していない）。
      this.noticeRestored(hasRestoredView(remembered, [...this.expanded], this.activePath));
      this.persistView();
    } catch (e) {
      this.error = errorMessage(e);
    } finally {
      this.loading = false;
    }
  }

  /** フォルダの開閉トグル。 */
  toggle(path: string): void {
    this.expanded = toggleExpanded(this.expanded, path);
    this.persistView();
  }

  /** ツリー全体のファイル relPath を平坦に集める（切替後の再オープン判定・外部からの指定検証用）。 */
  allFilePaths(): string[] {
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
   * 組み込み MCP サーバーの作業対象フォルダを追従させる（fire-and-forget）。
   * サーバーが起動していない環境では何も起きず、フォルダを開く操作自体は成功する。
   */
  private syncMcpRoot(root: string): void {
    void invoke('mcp_set_root', { root }).catch(() => undefined);
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

  /**
   * ルート配下のファイル / フォルダの名前を変更し、ツリーを取り直す。
   *
   * 開いていたファイルが改名対象（またはその配下）なら、新しいパスで開き直す。名前が
   * 使えないときや衝突したときは Rust 側が Err を返すので、そのまま投げて呼び出し元が
   * 入力欄にその理由を出す（ここでエラー表示に流すと、入力中の欄から目が離れるため）。
   */
  async renameEntry(relPath: string, newName: string): Promise<void> {
    if (this.root === null) return;
    const newPath = await invoke<string>('rename_entry', { root: this.root, relPath, newName });
    const prevActive = this.activePath;
    await this.scan(this.root); // activePath は null に戻る
    const next = remapRenamedPath(prevActive, relPath, newPath);
    if (shouldReopenFile(next, this.allFilePaths())) {
      // shouldReopenFile が true なら next は非 null。
      await this.select(next as string);
    }
  }

  /**
   * ルート配下に新しいファイルを作り、ツリーを取り直して開く。
   *
   * 既存があれば Rust 側が Err を返す（上書きしない）。呼び出し元が入力欄にその理由を出せるよう
   * そのまま投げる。作った先が畳まれた階層でも見つけられるよう、親フォルダは開いた状態にする。
   */
  async createDocument(relPath: string, content: string): Promise<void> {
    if (this.root === null) return;
    await invoke('create_document', { root: this.root, relPath, content });
    await this.scan(this.root); // activePath は null に戻る
    this.expanded = withAncestorsExpanded(this.expanded, relPath);
    if (shouldReopenFile(relPath, this.allFilePaths())) {
      await this.select(relPath);
    }
    this.persistView();
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

  /** ファイルを読み込み source に反映する。失敗時はエラー表示のみで前回内容を保持する。 */
  async select(relPath: string): Promise<void> {
    if (this.root === null) return;
    try {
      const content = await invoke<string>('read_document', { root: this.root, relPath });
      this.source = content;
      this.savedSource = content; // 開いた直後は未編集（dirty=false）
      this.activePath = relPath;
      // 保存時刻は開いているファイルのもの。別のファイルの時刻を引き継がせない。
      this.savedAt = null;
      this.loadSeq += 1;
      this.error = null;
      // 次にこのフォルダを開いたとき、同じファイルから再開できるようにする。
      this.persistView();
    } catch (e) {
      this.error = errorMessage(e);
    }
  }

  /** エディター / グリッド編集からの source 書き戻し。 */
  setSource(value: string): void {
    this.source = value;
  }

  /**
   * 未保存編集があるか（保存ボタン活性・タイトルの dirty ドット用）。
   *
   * 本文どうしの比較なのでファイルが育つほど費用が増える。編集のたびに何度読まれるかが
   * 外から見えないため、かかった時間を診断へ足す（合算されて 1 編集ぶんになる）。
   */
  get dirty(): boolean {
    const t0 = performance.now();
    try {
      return computeDirty(this.activePath, this.source, this.savedSource);
    } finally {
      perf.add('dirty', performance.now() - t0);
    }
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
    const startedAt = performance.now();
    try {
      await invoke('write_document', { root: this.root, relPath, content: snapshot });
      perf.recordSave(performance.now() - startedAt);
      this.savedSource = snapshot;
      this.savedAt = new Date();
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
