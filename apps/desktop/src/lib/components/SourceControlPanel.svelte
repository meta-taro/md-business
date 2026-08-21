<script lang="ts">
  // 下部「ソース管理」パネル（GitHub Desktop 風レイアウトを DevTools 風の下部ドロワーに）。
  // アプリから commit / push / pull できる仕組み。
  //
  // push は必ず人間の明示クリックから走る。自動 push・自動 merge の経路は用意しない
  // （共有ブランチへ出すかどうかは人が決めることなので、UI 以外から到達させない）。
  // 認証は OS の git 資格情報／SSH に委ね、アプリは資格情報を一切保持・入力しない。
  import { git } from '$lib/git/git.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import { diffView } from '$lib/git/diffView.svelte';
  import {
    gitMarkLetter,
    toTreeRelPath,
    commitTargets,
    shortHash,
    formatCommitDate,
    type GitFileStatus,
  } from '$lib/git/gitStatus';
  import { SvelteSet } from 'svelte/reactivity';
  import { i18n, t } from '$lib/i18n/i18n.svelte';

  interface Props {
    open: boolean;
    onclose: () => void;
  }
  const { open, onclose }: Props = $props();

  let message = $state('');
  let busy = $state(false);
  let error = $state<string | null>(null);
  let notice = $state<string | null>(null);
  // チェックを外したファイル。「含めるもの」ではなく「外したもの」を持つので、
  // 編集中に現れた新しい変更は既定で対象に入る（気付かず取りこぼさない）。
  const excluded = new SvelteSet<string>();

  const root = $derived(workspace.root);
  const targets = $derived(commitTargets(git.status.files, excluded));
  const allSelected = $derived(targets.count === git.changeCount);
  const canCommit = $derived(
    !busy && git.isRepo && targets.count > 0 && message.trim().length > 0 && root !== null,
  );

  function toggleFile(relPath: string): void {
    if (excluded.has(relPath)) excluded.delete(relPath);
    else excluded.add(relPath);
  }

  function toggleAll(): void {
    if (allSelected) for (const f of git.status.files) excluded.add(f.relPath);
    else excluded.clear();
  }
  // 履歴はパネルを開いたときとブランチ切替時に読み直す。保存のたびに走らせない
  // （git log は変更の保存では変わらないので、回すだけ無駄になる）。
  $effect(() => {
    git.branch; // 依存として読む（切り替えたら履歴も別物になる）
    if (!open || root === null) return;
    void git.loadLog(root);
  });

  // push / pull は upstream 未設定・up-to-date でも git 側が適切に応答する。isRepo なら押下可
  // とし、失敗（認証・非 ff・upstream 無し）は stderr をそのまま提示する。
  const canPush = $derived(!busy && git.isRepo && root !== null);
  const canPull = $derived(!busy && git.isRepo && root !== null);

  function toErr(e: unknown): string {
    // Rust の Err(String) は reject 値として届く（Error インスタンスとは限らない）。
    return e instanceof Error ? e.message : String(e);
  }

  async function doCommit(): Promise<void> {
    if (!canCommit || root === null) return;
    busy = true;
    error = null;
    notice = null;
    try {
      const { paths, count } = targets;
      await git.commit(root, message, paths);
      message = '';
      // 外した印はコミット後も残す。次のコミットで黙って混ざるより、
      // もう一度自分でチェックを戻してもらうほうが安全（一覧から消えた分は無視される）。
      notice = t('scm.committed', { count });
      await git.loadLog(root); // 履歴の先頭に今のコミットを出す
      // ツリーの色マークは git ストア更新で自動反映。ワークスペースの再走査は不要。
    } catch (e) {
      error = toErr(e);
    } finally {
      busy = false;
    }
  }

  // Git 管理下でないフォルダを開いたとき用。作るのは手元の履歴だけで、
  // リモートは設定しない（どこへ出すかは push の操作で人が決める）。
  const canInit = $derived(!busy && !git.isRepo && root !== null);

  async function doInit(): Promise<void> {
    if (!canInit || root === null) return;
    busy = true;
    error = null;
    notice = null;
    try {
      await git.init(root);
      await git.loadBranches(root);
      await git.loadLog(root); // まだコミットが無いので空。以後の追記でここへ出る
      notice = t('scm.initialized');
    } catch (e) {
      error = toErr(e);
    } finally {
      busy = false;
    }
  }

  // 既にあるリポジトリを、開いている空のフォルダへ複製する。
  // 資格情報は入力させない（アプリは預からない）。OS に預けてある分で通らなければ失敗にする。
  let cloneUrl = $state('');
  const canClone = $derived(!busy && !git.isRepo && cloneUrl.trim().length > 0 && root !== null);

  async function doClone(): Promise<void> {
    if (!canClone || root === null) return;
    busy = true;
    error = null;
    notice = null;
    try {
      await git.clone(root, cloneUrl);
      cloneUrl = '';
      await git.loadBranches(root);
      await git.loadLog(root);
      // 複製で現れたファイルはツリーにまだ無い。開き直さずに走査だけやり直す。
      await workspace.rescanPreservingActive();
      notice = t('scm.cloned');
    } catch (e) {
      error = toErr(e);
    } finally {
      busy = false;
    }
  }

  async function doPush(): Promise<void> {
    if (!canPush || root === null) return;
    busy = true;
    error = null;
    notice = null;
    try {
      await git.push(root);
      notice = t('scm.pushed');
    } catch (e) {
      error = toErr(e);
    } finally {
      busy = false;
    }
  }

  async function doPull(): Promise<void> {
    if (!canPull || root === null) return;
    busy = true;
    error = null;
    notice = null;
    try {
      await git.pull(root);
      await git.loadLog(root); // 取り込んだコミットを履歴へ反映
      notice = t('scm.pulled');
    } catch (e) {
      error = toErr(e);
    } finally {
      busy = false;
    }
  }

  // 変更ファイル行クリック: エディターで開き、差分をプレビュー側に出す。
  // f.relPath は repo root 基準。エディターは開いたフォルダ基準のパスを要るので prefix を剥がす。
  // 開いたフォルダの外・削除済みファイルはエディターで開けないので差分表示のみにする。
  async function onFileClick(f: GitFileStatus): Promise<void> {
    if (root === null) return;
    const treeRel = toTreeRelPath(git.status.prefix, f.relPath);
    if (treeRel !== null && f.state !== 'deleted') {
      await workspace.select(treeRel); // エディターへ内容を読み込む（失敗時は workspace 側でエラー表示）
    }
    void diffView.show(root, f.relPath, f.state); // プレビュー面を差分表示へ
  }

  // Ctrl/⌘+Enter でコミット（メッセージ入力中の定番）。
  function onMessageKeydown(e: KeyboardEvent): void {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      void doCommit();
    }
  }
</script>

{#if open}
  <section class="scm" aria-label={t('status.sourceControl')}>
    <header class="scm-head">
      <div class="head-left">
        <span class="title">{t('status.sourceControl')}</span>
        {#if git.isRepo}
          <span class="branch"><span class="dot ok" aria-hidden="true"></span>{git.branch ?? 'detached'}</span>
          {#if git.ahead > 0 || git.behind > 0}
            <span class="muted" title={t('status.aheadBehindTitle')}>↑{git.ahead} ↓{git.behind}</span>
          {/if}
        {:else}
          <span class="muted">{t('status.noRepo')}</span>
          <button class="chip" type="button" onclick={doInit} disabled={!canInit} title={t('scm.initTitle')}>
            {t('scm.init')}
          </button>
          <input
            class="clone-url"
            type="text"
            bind:value={cloneUrl}
            placeholder={t('scm.cloneUrlPlaceholder')}
            aria-label={t('scm.cloneUrlPlaceholder')}
            disabled={busy}
          />
          <button class="chip" type="button" onclick={doClone} disabled={!canClone} title={t('scm.cloneTitle')}>
            {t('scm.clone')}
          </button>
        {/if}
      </div>
      <div class="head-right">
        <button class="chip" type="button" onclick={doPull} disabled={!canPull} title={t('scm.pullTitle')}>
          Pull{#if git.behind > 0}<span class="count">{git.behind}</span>{/if}
        </button>
        <button class="chip" type="button" onclick={doPush} disabled={!canPush} title={t('scm.pushTitle')}>
          Push{#if git.ahead > 0}<span class="count">{git.ahead}</span>{/if}
        </button>
        <button class="icon-btn" type="button" onclick={onclose} title={t('common.close')} aria-label={t('scm.closePanel')}>▾</button>
      </div>
    </header>

    {#if error}
      <div class="banner err" role="alert">
        <strong>{t('scm.failed')}</strong>
        <pre>{error}</pre>
      </div>
    {:else if notice}
      <div class="banner ok" role="status">{notice}</div>
    {/if}

    <div class="scm-body">
      <div class="changes">
        <div class="col-title">
          {#if git.changeCount > 0}
            <label class="pick-all">
              <input
                type="checkbox"
                checked={allSelected}
                indeterminate={targets.count > 0 && !allSelected}
                onchange={toggleAll}
                disabled={busy}
              />
              {t('scm.changes')}
            </label>
            <span class="muted">({targets.count}/{git.changeCount})</span>
          {:else}
            {t('scm.changes')} <span class="muted">(0)</span>
          {/if}
        </div>
        {#if git.changeCount === 0}
          <p class="empty">{t('scm.noChanges')}</p>
        {:else}
          <ul class="file-list">
            {#each git.status.files as f (f.relPath)}
              <li class="file-item" class:dropped={excluded.has(f.relPath)}>
                <input
                  class="pick"
                  type="checkbox"
                  checked={!excluded.has(f.relPath)}
                  onchange={() => toggleFile(f.relPath)}
                  disabled={busy}
                  aria-label={t('scm.pickFile', { path: f.relPath })}
                />
                <button
                  class="file-row"
                  type="button"
                  data-git={f.state}
                  class:selected={diffView.active && diffView.relPath === f.relPath}
                  onclick={() => onFileClick(f)}
                  title={t('scm.fileRowTitle', { path: f.relPath })}
                >
                  <span class="mark">{gitMarkLetter(f.state)}</span>
                  <span class="path">{f.relPath}</span>
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </div>

      <div class="commit">
        <div class="col-title">{t('scm.commitHead')}</div>
        <textarea
          class="msg"
          bind:value={message}
          placeholder={t('scm.messagePlaceholder')}
          rows="3"
          disabled={busy || !git.isRepo}
          onkeydown={onMessageKeydown}
        ></textarea>
        <button class="commit-btn" type="button" onclick={doCommit} disabled={!canCommit}>
          {#if busy}
            {t('scm.working')}
          {:else if targets.count > 0}
            {t('scm.commitCount', { count: targets.count })}
          {:else}
            {t('scm.commit')}
          {/if}
        </button>
        <p class="hint">{t('scm.stageHint')}</p>
      </div>

      <div class="history">
        <div class="col-title">
          {t('scm.history')}
          {#if git.log.length > 0}<span class="muted">({git.log.length})</span>{/if}
        </div>
        {#if git.log.length === 0}
          <p class="empty">{t('scm.noHistory')}</p>
        {:else}
          <ul class="log-list">
            {#each git.log as c (c.hash)}
              <li class="log-item" title={t('scm.commitTitle', { hash: c.hash, author: c.author })}>
                <div class="log-subject">{c.subject}</div>
                <div class="log-meta">
                  <span class="log-hash">{shortHash(c.hash)}</span>
                  <span class="log-author">{c.author}</span>
                  <span class="log-date">{formatCommitDate(c.date, i18n.locale)}</span>
                </div>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    </div>
  </section>
{/if}

<style>
  .scm {
    display: flex;
    flex-direction: column;
    max-height: 320px;
    background: var(--bg-subtle);
    border-top: 1px solid var(--border-strong);
    font-size: var(--text-sm-size);
    color: var(--text-primary);
  }

  .scm-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-3);
    border-bottom: 1px solid var(--border);
  }

  .head-left,
  .head-right {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
  }

  .title {
    font-weight: 600;
    font-size: var(--text-xs-size);
    letter-spacing: var(--tracking-tight);
    color: var(--text-secondary);
    text-transform: uppercase;
  }

  .branch {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: var(--text-xs-size);
    color: var(--text-secondary);
  }

  .muted {
    color: var(--text-tertiary);
    font-size: var(--text-xs-size);
  }

  .dot {
    width: 7px;
    height: 7px;
    border-radius: var(--radius-full);
    flex: none;
  }

  .dot.ok {
    background: var(--success-fg, #4ca66a);
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 24px;
    padding: 0 var(--space-3);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    background: var(--bg-elevated);
    color: var(--text-primary);
    font-size: var(--text-xs-size);
    cursor: pointer;
    transition: background var(--dur-fast) var(--ease);
  }

  .chip:hover:not(:disabled) {
    background: var(--bg-hover);
  }

  .chip:disabled {
    opacity: 0.5;
    cursor: default;
  }

  /* 複製元の入力。Git 管理下でないフォルダのときだけ出る。 */
  .clone-url {
    width: 240px;
    height: 24px;
    padding: 0 var(--space-2);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    background: var(--bg-input, var(--bg-elevated));
    color: var(--text-primary);
    font-size: var(--text-xs-size);
  }

  .clone-url:disabled {
    opacity: 0.5;
  }

  .count {
    min-width: 16px;
    padding: 0 4px;
    border-radius: var(--radius-full);
    background: var(--accent-subtle);
    color: var(--accent);
    font-size: var(--text-2xs-size, 10px);
    font-weight: 600;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }

  .icon-btn {
    width: 24px;
    height: 24px;
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
  }

  .icon-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .banner {
    margin: var(--space-2) var(--space-3) 0;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-sm);
    font-size: var(--text-xs-size);
  }

  .banner.err {
    background: color-mix(in srgb, var(--danger-fg, #c7502f) 12%, transparent);
  }

  .banner.err strong {
    display: block;
    margin-bottom: 4px;
    color: var(--danger-fg, #c7502f);
  }

  .banner.err pre {
    margin: 0;
    max-height: 96px;
    overflow: auto;
    white-space: pre-wrap;
    word-break: break-word;
    font-size: var(--text-2xs-size, 10px);
    color: var(--text-secondary);
  }

  .banner.ok {
    background: color-mix(in srgb, var(--success-fg, #4ca66a) 14%, transparent);
    color: var(--text-secondary);
  }

  .scm-body {
    display: grid;
    /* 変更 / コミット / 履歴。minmax(0,…) で長いパス・件名が桁を押し広げないようにする。 */
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.1fr);
    gap: var(--space-3);
    padding: var(--space-3);
    min-height: 0;
    overflow: hidden;
  }

  .col-title {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-bottom: var(--space-2);
    font-size: var(--text-xs-size);
    font-weight: 600;
    color: var(--text-secondary);
  }

  .pick-all {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
  }

  .pick-all input,
  .pick {
    width: 13px;
    height: 13px;
    margin: 0;
    flex: none;
    accent-color: var(--accent);
    cursor: pointer;
  }

  .file-item {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding-left: var(--space-2);
  }

  /* チェックを外した行は薄くする（一覧からは消さない＝外したことが見えるように）。 */
  .file-item.dropped .file-row {
    opacity: 0.45;
    text-decoration: line-through;
  }

  .changes {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .file-list {
    margin: 0;
    padding: 0;
    list-style: none;
    overflow-y: auto;
    max-height: 200px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg-app);
  }

  .file-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    padding: 3px var(--space-2);
    border: none;
    background: transparent;
    font-size: var(--text-xs-size);
    text-align: left;
    cursor: pointer;
    color: inherit;
    transition: background var(--dur-fast) var(--ease);
  }

  .file-row:hover {
    background: var(--bg-hover);
  }

  .file-row.selected {
    background: var(--accent-subtle);
  }

  .file-row:focus-visible {
    outline: none;
    box-shadow: inset 0 0 0 2px var(--accent);
  }

  .mark {
    flex: none;
    width: 12px;
    text-align: center;
    font-weight: 700;
    font-size: var(--text-2xs-size, 10px);
  }

  .path {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--font-mono);
  }

  /* FileTree と同じ gitDecoration 色（明暗どちらでも読める中間トーン）。 */
  .file-row[data-git='modified'],
  .file-row[data-git='renamed'] {
    color: #d9a441;
  }

  .file-row[data-git='untracked'],
  .file-row[data-git='added'] {
    color: #4ca66a;
  }

  .file-row[data-git='deleted'] {
    color: #c7502f;
  }

  .file-row[data-git='conflicted'] {
    color: #c94f6d;
  }

  .empty {
    margin: 0;
    padding: var(--space-3);
    color: var(--text-tertiary);
    font-size: var(--text-xs-size);
    border: 1px dashed var(--border);
    border-radius: var(--radius-sm);
    text-align: center;
  }

  .commit {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .msg {
    resize: none;
    width: 100%;
    padding: var(--space-2);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    background: var(--bg-app);
    color: var(--text-primary);
    font-family: var(--font-sans, inherit);
    font-size: var(--text-sm-size);
    line-height: 1.5;
  }

  .msg:focus-visible {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-subtle);
  }

  .msg:disabled {
    opacity: 0.6;
  }

  .commit-btn {
    margin-top: var(--space-2);
    height: 30px;
    border: none;
    border-radius: var(--radius-sm);
    background: var(--accent);
    color: var(--accent-contrast, #fff);
    font-size: var(--text-sm-size);
    font-weight: 600;
    cursor: pointer;
    transition: opacity var(--dur-fast) var(--ease);
  }

  .commit-btn:hover:not(:disabled) {
    opacity: 0.9;
  }

  .commit-btn:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .hint {
    margin: var(--space-1) 0 0;
    color: var(--text-tertiary);
    font-size: var(--text-2xs-size, 10px);
  }

  .history {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .log-list {
    margin: 0;
    padding: 0;
    list-style: none;
    overflow-y: auto;
    max-height: 200px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg-app);
  }

  .log-item {
    padding: 4px var(--space-2);
    border-bottom: 1px solid var(--border);
  }

  .log-item:last-child {
    border-bottom: none;
  }

  .log-subject {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--text-xs-size);
  }

  .log-meta {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-top: 1px;
    color: var(--text-tertiary);
    font-size: var(--text-2xs-size, 10px);
  }

  .log-hash {
    flex: none;
    font-family: var(--font-mono);
  }

  .log-author {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .log-date {
    margin-left: auto;
    flex: none;
    font-variant-numeric: tabular-nums;
  }
</style>
