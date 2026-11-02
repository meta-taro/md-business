/**
 * ツリーの絞り込み欄から引く横断検索（題名・本文）の状態。
 *
 * 本文を読むのは重いので、索引は**絞り込みに何か打たれたときに初めて**作る。
 * 走査し直す（保存・改名・外部の変更）と索引は古くなるので、次に引くときに作り直す。
 *
 * 検索の部品も引くときに初めて読み込む。ツリーは起動時に出るので、ここで静的に読むと
 * 一度も検索しない人の起動まで重くなる。
 */
import { invoke } from '@tauri-apps/api/core';
import type { IndexedFile, WorkspaceHit } from '@md-business/explorer';
import { workspace } from './workspace.svelte';

const loadSearch = () => import('./workspaceSearch');

class ContentSearchStore {
  hits = $state.raw<WorkspaceHit[]>([]);
  /** 本文を読んでいる最中か */
  indexing = $state<boolean>(false);
  /** 本数の上限で、本文を読まなかったものがあるか */
  truncated = $state<boolean>(false);

  private index: IndexedFile[] | null = null;
  private indexedGeneration = -1;
  private building: Promise<void> | null = null;
  /** 最後に頼まれた検索。索引を作っている間に打ち変えられたら、そちらだけを出す */
  private latest = 0;

  async run(query: string, shownInTree: ReadonlySet<string>): Promise<void> {
    const ticket = ++this.latest;
    if (query.trim() === '' || workspace.root === null) {
      this.hits = [];
      return;
    }
    await this.ensureIndex();
    if (ticket !== this.latest || this.index === null) return;
    const { contentHits } = await loadSearch();
    if (ticket !== this.latest) return;
    this.hits = contentHits(this.index, query, shownInTree);
  }

  private ensureIndex(): Promise<void> {
    if (this.indexedGeneration === workspace.scanGeneration && this.index !== null) return Promise.resolve();
    this.building ??= this.build().finally(() => (this.building = null));
    return this.building;
  }

  private async build(): Promise<void> {
    const root = workspace.root;
    const generation = workspace.scanGeneration;
    if (root === null) return;
    const includeSite = workspace.siteVisible;
    this.indexing = true;
    try {
      const [{ indexWorkspace }, { readFilesForIndex }] = await Promise.all([
        import('@md-business/explorer'),
        loadSearch(),
      ]);
      const result = await readFilesForIndex(
        workspace.entries,
        (relPath) => invoke<string>('read_document', { root, relPath, includeSite }),
        { isStale: () => workspace.scanGeneration !== generation || workspace.root !== root },
      );
      // 読んでいる間に走査し直したら、作り直しは次に引いたときに回す。
      if (result === null) return;
      this.index = indexWorkspace(result.files);
      this.indexedGeneration = generation;
      this.truncated = result.truncated;
    } finally {
      this.indexing = false;
    }
  }
}

export const contentSearch = new ContentSearchStore();
