<script lang="ts">
  // 左レール。共有 workspace ストアのツリーを描画し、フォルダ開閉・ファイル選択を配線する
  // （DOC-SPEC-DESKTOP-2026-0001 §3.3 / §6.1）。走査・読込は Rust コマンド、可視行の
  // 平坦化は workspaceLogic の純関数（単体テスト済み）に委譲する。スキーマ別アイコン色・
  // 選択ハイライトの仕上げは Phase D。
  import { tick } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  import { openUrl, revealItemInDir } from '@tauri-apps/plugin-opener';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import {
    flattenVisible,
    filterTree,
    collectFolderPaths,
    shouldClearFilter,
    decideTreeKey,
  } from '$lib/workspace/workspaceLogic';
  import { git } from '$lib/git/git.svelte';
  import { diffView } from '$lib/git/diffView.svelte';
  import { gitMarkLetter, type GitFileState } from '$lib/git/gitStatus';
  import { t } from '$lib/i18n/i18n.svelte';
  import { folderLabel } from '$lib/workspace/recentFolders';
  import { toAbsolutePath, menuActionsForKind, type FileTreeMenuAction } from './fileTreeMenu';

  // git 状態 → ホバー説明（バッジ title）。色マークの意味を言葉でも補う。
  // t() はロケール反応なので関数で都度引く（キーは git.state.<state>）。
  const gitTitle = (state: GitFileState): string => t(`git.state.${state}`);

  // 折り畳み（右 SidePanel と対称）。畳み状態と切替はレイアウトが所有し、props で受ける。
  let { collapsed = false, ontoggle }: { collapsed?: boolean; ontoggle?: () => void } = $props();

  // エクスプローラーのフィルタ検索。入力がある間は絞り込みツリーを全展開で描画し、
  // 空なら通常（展開状態に従う）描画へ戻す。純ロジックは workspaceLogic に委譲（テスト済み）。
  let filterQuery = $state('');
  const filtering = $derived(filterQuery.trim() !== '');
  const filteredTree = $derived(filterTree(workspace.tree, filterQuery));

  // 展開状態 or ツリー変化 or フィルタで可視行を再導出する。
  const rows = $derived(
    filtering
      ? flattenVisible(filteredTree, new Set(collectFolderPaths(filteredTree)))
      : flattenVisible(workspace.tree, workspace.expanded),
  );

  function onRowClick(path: string, kind: 'folder' | 'file'): void {
    if (kind === 'folder') {
      workspace.toggle(path);
    } else {
      // 通常のファイルオープンでは差分表示を解除して普通のプレビューへ戻す
      // （差分は「ソース管理パネルで変更ファイルをクリックした間だけ」の一時表示）。
      diffView.reset();
      void workspace.select(path);
    }
  }

  // ── 十字キー操作 ──────────────────────────────────────────────
  // ツリー全体で Tab 位置を 1 つに絞り（roving tabindex）、中の移動は十字キーで行う。
  // 何が起きるかの判断は decideTreeKey（単体テスト済み）に委ね、ここは focus 当てだけ持つ。
  let treeEl = $state<HTMLElement | null>(null);
  let focusIndex = $state(0);
  // 走査やフィルタで行が減ると位置が浮く。Tab で必ずどこかに入れるよう先頭へ寄せる。
  const tabIndex = $derived(focusIndex < rows.length ? focusIndex : 0);

  async function focusRow(index: number): Promise<void> {
    focusIndex = index;
    // 開閉直後は行数が変わる。DOM が揃ってから当てる。
    await tick();
    treeEl?.querySelectorAll<HTMLButtonElement>('button.row')[index]?.focus();
  }

  function onTreeKeydown(e: KeyboardEvent): void {
    const action = decideTreeKey(e.key, {
      rows,
      index: focusIndex,
      expanded: workspace.expanded,
      // 絞り込み中は全展開の一時ツリーなので、開閉はさせず移動だけにする。
      toggleable: !filtering,
    });
    if (action === null) return;
    e.preventDefault();
    if (action.kind === 'move') {
      void focusRow(action.index);
    } else {
      // expand は畳んだフォルダ、collapse は開いたフォルダにだけ返るので切替で足りる。
      workspace.toggle(action.path);
    }
  }

  // Esc でフィルタをクリア（入力が空・IME 変換中は何もしない）。判定は純ロジックへ委譲。
  function onFilterKeydown(e: KeyboardEvent): void {
    if (shouldClearFilter(e.key, e.isComposing, filterQuery)) {
      e.preventDefault();
      filterQuery = '';
    }
  }

  // ── 最近開いたフォルダ ────────────────────────────────────────
  // 空状態では一覧をそのまま並べ、フォルダを開いている間はヘッダーの ▾ から出す
  // （開いている一覧は場所を取るので、必要なときだけ開く）。
  let recentOpen = $state(false);
  // 今開いているフォルダは選び直す意味がないので一覧から外す。
  const recentList = $derived(workspace.recent.filter((p) => p !== workspace.root));

  async function pickRecent(path: string): Promise<void> {
    await workspace.openRecent(path);
    // 開けなかったフォルダには一覧上で印が付く。閉じると何が起きたか分からないので開いたまま。
    if (!workspace.missingRecent.has(path)) recentOpen = false;
  }

  // ── 右クリックコンテキストメニュー（reveal / パスコピー / リモートで開く）──
  // 開いているノードのスクリーン座標・種別・利用可能項目と、forge_file_url の解決結果を保持する
  // （forgeUrl が null なら remote 無し等でフォージ項目を出さない）。純ロジックは fileTreeMenu に委譲。
  let menu = $state<{
    x: number;
    y: number;
    path: string;
    kind: 'file' | 'folder';
    actions: FileTreeMenuAction[];
    forgeUrl: string | null;
  } | null>(null);

  const menuLabel = (action: FileTreeMenuAction): string =>
    action === 'reveal'
      ? t('tree.menuReveal')
      : action === 'copyPath'
        ? t('tree.menuCopyPath')
        : t('tree.menuOpenForge');

  function openMenu(event: MouseEvent, path: string, kind: 'folder' | 'file'): void {
    event.preventDefault();
    menu = { x: event.clientX, y: event.clientY, path, kind, actions: menuActionsForKind(kind), forgeUrl: null };
    // フォージ URL は Rust 側で git remote/branch から非同期解決する。作れなければ項目を隠す。
    if (kind === 'file' && workspace.root !== null) {
      void invoke<string | null>('forge_file_url', { root: workspace.root, relPath: path })
        .then((url) => {
          // メニューが同じノードで開いたままのときだけ反映（別ノードへ開き直し後の遅延解決を無視）。
          if (menu !== null && menu.path === path) menu = { ...menu, forgeUrl: url };
        })
        .catch(() => undefined);
    }
  }

  function closeMenu(): void {
    menu = null;
  }

  async function runMenuAction(action: FileTreeMenuAction): Promise<void> {
    const m = menu;
    closeMenu();
    if (m === null || workspace.root === null) return;
    const abs = toAbsolutePath(workspace.root, m.path);
    if (action === 'reveal') {
      await revealItemInDir(abs).catch(() => undefined);
    } else if (action === 'copyPath') {
      await navigator.clipboard.writeText(abs).catch(() => undefined);
    } else if (action === 'openForge' && m.forgeUrl !== null) {
      await openUrl(m.forgeUrl).catch(() => undefined);
    }
  }

  // メニュー / 履歴ポップオーバー表示中の Esc で閉じる
  // （フィルタ入力の Esc とは、開いているものを優先することで排他になる）。
  function onWindowKeydown(e: KeyboardEvent): void {
    if (e.key !== 'Escape') return;
    if (menu !== null) {
      e.preventDefault();
      closeMenu();
    } else if (recentOpen) {
      e.preventDefault();
      recentOpen = false;
    }
  }
</script>

<!-- 履歴 1 件分の行。空状態の一覧とヘッダーのポップオーバーで同じ見た目を使う。 -->
{#snippet recentRow(path: string)}
  {@const label = folderLabel(path)}
  {@const missing = workspace.missingRecent.has(path)}
  <li class="recent-item" class:missing>
    <button
      class="recent-pick"
      type="button"
      onclick={() => pickRecent(path)}
      disabled={workspace.loading}
      title={path}
    >
      <span class="recent-name">{label.name}</span>
      {#if missing}
        <span class="recent-badge">{t('tree.recentMissing')}</span>
      {/if}
      {#if label.parent !== ''}
        <!-- 同名フォルダを見分けるための親パス。長いので右側から詰めて見せる。 -->
        <span class="recent-parent">{label.parent}</span>
      {/if}
    </button>
    <button
      class="recent-forget"
      type="button"
      onclick={() => workspace.forgetRecent(path)}
      title={t('tree.recentForget')}
      aria-label={t('tree.recentForget')}
    >
      ✕
    </button>
  </li>
{/snippet}

<nav class="filetree" class:collapsed aria-label={t('tree.label')}>
  {#if collapsed}
    <!-- 折り畳み時は縦レールのみ。› で開く（SidePanel の ‹ › と対称）。 -->
    <button
      class="rail-toggle"
      type="button"
      onclick={ontoggle}
      title={t('tree.expandExplorer')}
      aria-label={t('tree.expandExplorer')}
    >
      ›
    </button>
  {:else}
  <div class="head">
    <div class="head-left">
      <button
        class="collapse"
        type="button"
        onclick={ontoggle}
        title={t('tree.collapseExplorer')}
        aria-label={t('tree.collapseExplorer')}
      >
        ‹
      </button>
      <span class="title">{t('tree.explorer')}</span>
    </div>
    {#if workspace.root !== null}
      <div class="head-actions">
        <button
          class="reopen"
          type="button"
          onclick={() => workspace.openFolder()}
          title={t('tree.openOtherFolder')}
          aria-label={t('tree.openOtherFolder')}
        >
          {t('tree.open')}
        </button>
        {#if recentList.length > 0}
          <!-- 履歴からの選び直し。開いているフォルダは除いてあるので、1 件でも意味がある。 -->
          <button
            class="reopen recent-toggle"
            class:on={recentOpen}
            type="button"
            onclick={() => (recentOpen = !recentOpen)}
            title={t('tree.recentPick')}
            aria-label={t('tree.recentPick')}
            aria-expanded={recentOpen}
          >
            ▾
          </button>
        {/if}
      </div>
    {/if}
  </div>

  {#if recentOpen && recentList.length > 0}
    <!-- クリック外しで閉じる（ポップオーバーの外側全面）。 -->
    <button
      class="recent-backdrop"
      type="button"
      tabindex="-1"
      aria-hidden="true"
      onclick={() => (recentOpen = false)}
    ></button>
    <div class="recent-pop">
      <p class="recent-head">{t('tree.recent')}</p>
      <ul class="recent-list">
        {#each recentList as path (path)}
          {@render recentRow(path)}
        {/each}
      </ul>
    </div>
  {/if}

  {#if workspace.root !== null}
    <!-- ファイル名フィルタ（エクスプローラーヘッダー直下）。入力中は絞り込みツリーを全展開表示。 -->
    <div class="filter" class:active={filtering}>
      <svg class="filter-ico" viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="7" cy="7" r="4.2" fill="none" stroke="currentColor" stroke-width="1.2" />
        <path d="M10.2 10.2L14 14" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
      </svg>
      <input
        class="filter-input"
        type="text"
        bind:value={filterQuery}
        placeholder={t('tree.filterPlaceholder')}
        spellcheck="false"
        autocomplete="off"
        aria-label={t('tree.filterPlaceholder')}
        onkeydown={onFilterKeydown}
      />
      {#if filterQuery !== ''}
        <button
          class="filter-clear"
          type="button"
          onclick={() => (filterQuery = '')}
          title={t('tree.filterClearTitle')}
          aria-label={t('tree.filterClear')}
        >
          ✕
        </button>
      {/if}
    </div>
  {/if}

  {#if workspace.error !== null}
    <p class="banner err" role="alert">{workspace.error}</p>
  {/if}

  {#if workspace.root === null}
    <!-- 空状態: フォルダ未選択 -->
    <div class="empty">
      <p class="hint">{t('tree.emptyHint')}</p>
      <button
        class="open"
        type="button"
        onclick={() => workspace.openFolder()}
        disabled={workspace.loading}
      >
        {workspace.loading ? t('tree.loading') : t('tree.openFolder')}
      </button>
      {#if recentList.length > 0}
        <!-- 起動直後に毎回ダイアログを辿らずに済むよう、過去に開いたフォルダを直接並べる。 -->
        <div class="recent-empty">
          <p class="recent-head">{t('tree.recent')}</p>
          <ul class="recent-list">
            {#each recentList as path (path)}
              {@render recentRow(path)}
            {/each}
          </ul>
        </div>
      {/if}
    </div>
  {:else if rows.length === 0}
    <!-- フィルタで 0 件 か 空フォルダ かで文言を分ける。 -->
    <div class="empty">
      {#if filtering}
        <p class="hint">{t('tree.filterNoMatch', { query: filterQuery.trim() })}</p>
      {:else}
        <p class="hint">{t('tree.noFiles')}</p>
      {/if}
    </div>
  {:else}
    <!-- 十字キーはツリー全体で受け、行の button には roving tabindex を配る。 -->
    <ul class="tree" role="tree" bind:this={treeEl} onscroll={closeMenu} onkeydown={onTreeKeydown}>
      {#each rows as row, i (row.node.path)}
        {@const node = row.node}
        {@const gitState = node.kind === 'file' ? git.stateOf(node.path) : null}
        {@const selected = node.kind === 'file' && workspace.activePath === node.path}
        <li role="none">
          <button
            class="row"
            class:active={selected}
            type="button"
            role="treeitem"
            tabindex={i === tabIndex ? 0 : -1}
            aria-level={row.depth + 1}
            aria-selected={selected}
            aria-expanded={node.kind === 'folder' ? workspace.expanded.has(node.path) : undefined}
            style="--depth: {row.depth}"
            data-git={gitState}
            onclick={() => {
              focusIndex = i;
              onRowClick(node.path, node.kind);
            }}
            oncontextmenu={(e) => openMenu(e, node.path, node.kind)}
            title={node.path}
          >
            {#if node.kind === 'folder'}
              {@const open = workspace.expanded.has(node.path)}
              <!-- 開閉シェブロン（回転で状態を示す）。状態クラスは expanded。
                   ※ open だと空状態ボタン .open（枠・角丸・地つき）と衝突し、
                   展開フォルダの caret がカプセル化する（旧「謎の白丸」の正体）。 -->
              <svg class="caret" class:expanded={open} viewBox="0 0 16 16" aria-hidden="true">
                <path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.6"
                  stroke-linecap="round" stroke-linejoin="round" />
              </svg>
              <!-- フォルダ（開/閉で口を変える）。開はバック板 + 前面トレイの 2 ピースで
                   「開いた口」を表す。旧・単一パスは右下が塗られず欠けて見えた。 -->
              <svg class="ico folder" viewBox="0 0 16 16" aria-hidden="true">
                {#if open}
                  <path d="M1.5 4A1.3 1.3 0 012.8 2.7h2.9l1.3 1.5H12.6A1.3 1.3 0 0113.9 5.5V7H5.5a1.6 1.6 0 00-1.55 1.18L2.6 12.2H1.5z"
                    fill="currentColor" opacity="0.9" />
                  <path d="M3.4 13l1.4-4.9A1 1 0 015.76 7.4H14.6a.8.8 0 01.77 1.02L14.1 12.4a1 1 0 01-.96.72z"
                    fill="currentColor" opacity="0.9" />
                {:else}
                  <path d="M1.5 4A1.5 1.5 0 013 2.5h3.3l1.2 1.4H13A1.5 1.5 0 0114.5 5.4v6.1A1.5 1.5 0 0113 13H3a1.5 1.5 0 01-1.5-1.5z"
                    fill="currentColor" opacity="0.9" />
                {/if}
              </svg>
            {:else}
              <span class="caret spacer" aria-hidden="true"></span>
              <!-- ファイル（折れ角つき文書・拡張子で色分け: .md / .tsv） -->
              <svg class="ico file {node.ext}" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M4 1.5h5l3 3v9A0.5 0.5 0 0111.5 14h-7A0.5 0.5 0 014 13.5v-11A0.5 0.5 0 014 1.5z"
                  fill="currentColor" opacity="0.9" />
                <path d="M9 1.5v3h3" fill="none" stroke="var(--bg-subtle)" stroke-width="1" />
              </svg>
            {/if}
            <span class="name">{node.name}</span>
            {#if gitState}
              <!-- VSCode 風の右肩バッジ。色は行の data-git を継いで CSS 側で決める。 -->
              <span class="git-mark" title={gitTitle(gitState)}>{gitMarkLetter(gitState)}</span>
            {/if}
          </button>
        </li>
      {/each}
    </ul>

    {#if workspace.truncated}
      <p class="banner warn" role="status">{t('tree.truncated')}</p>
    {/if}
  {/if}
  {/if}
</nav>

<svelte:window onkeydown={onWindowKeydown} />

{#if menu !== null}
  <!-- クリック外し用の全画面バックドロップ。メニューより下・本文より上に敷き、
       左/右クリックとも閉じる（右クリックは既定メニュー抑止）。 -->
  <button
    class="menu-backdrop"
    type="button"
    tabindex="-1"
    aria-hidden="true"
    onclick={closeMenu}
    oncontextmenu={(e) => {
      e.preventDefault();
      closeMenu();
    }}
  ></button>
  <ul class="ctx-menu" style="left: {menu.x}px; top: {menu.y}px;" role="menu">
    {#each menu.actions as action (action)}
      <!-- フォージ項目は URL を作れたときだけ出す（remote 無し・非リポジトリでは非表示）。 -->
      {#if action !== 'openForge' || menu.forgeUrl !== null}
        <li role="none">
          <button class="ctx-item" type="button" role="menuitem" onclick={() => runMenuAction(action)}>
            {menuLabel(action)}
          </button>
        </li>
      {/if}
    {/each}
  </ul>
{/if}

<style>
  .filetree {
    height: 100%;
    display: flex;
    flex-direction: column;
    /* 履歴ポップオーバーをヘッダー直下へ重ねるための基準。 */
    position: relative;
    background: var(--bg-subtle);
    border-right: 1px solid var(--border);
    overflow: hidden;
  }

  /* 折り畳み時は縦レール（40px）。右 SidePanel と対称。 */
  .rail-toggle {
    width: 100%;
    height: 40px;
    border: none;
    background: transparent;
    color: var(--text-tertiary);
    font-size: 16px;
    line-height: 1;
    cursor: pointer;
    transition:
      background var(--dur-fast) var(--ease),
      color var(--dur-fast) var(--ease);
  }

  .rail-toggle:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .rail-toggle:focus-visible {
    outline: none;
    box-shadow: inset 0 0 0 2px var(--accent);
    color: var(--text-primary);
  }

  .head {
    height: 34px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 var(--space-3) 0 var(--space-2);
    flex: none;
  }

  .head-left {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    min-width: 0;
  }

  /* ヘッダーの畳みボタン（開いている状態から ‹ で畳む）。 */
  .collapse {
    width: 22px;
    height: 22px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-tertiary);
    font-size: 14px;
    line-height: 1;
    cursor: pointer;
    flex: none;
  }

  .collapse:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .collapse:focus-visible {
    outline: none;
    box-shadow: inset 0 0 0 2px var(--accent);
    color: var(--text-primary);
  }

  .title {
    font-size: var(--text-2xs-size);
    font-weight: var(--text-2xs-weight);
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-tertiary);
  }

  .head-actions {
    display: flex;
    align-items: center;
    gap: 2px;
    flex: none;
  }

  .reopen {
    height: 22px;
    padding: 0 var(--space-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-secondary);
    font-size: var(--text-2xs-size);
    cursor: pointer;
  }

  .reopen:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  /* ── 最近開いたフォルダ ───────────────────────────────────── */
  .recent-toggle {
    padding: 0 var(--space-1);
    font-size: 10px;
    line-height: 1;
  }

  .recent-toggle.on {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .recent-backdrop {
    position: fixed;
    inset: 0;
    z-index: 80;
    border: none;
    padding: 0;
    background: transparent;
    cursor: default;
  }

  /* ヘッダー直下に重ねる。ツリーを押し下げず、閉じれば元の見え方に戻る。 */
  .recent-pop {
    position: absolute;
    z-index: 81;
    top: 34px;
    left: var(--space-2);
    right: var(--space-2);
    padding: var(--space-1);
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    box-shadow: 0 6px 20px rgb(0 0 0 / 0.28);
  }

  /* 空状態では一覧を本文として置く（重ねる相手がいないため）。 */
  .recent-empty {
    width: 100%;
    text-align: left;
  }

  .recent-head {
    margin: 0 0 var(--space-1);
    padding: 0 var(--space-2);
    font-size: var(--text-2xs-size);
    font-weight: var(--text-2xs-weight);
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-tertiary);
  }

  .recent-list {
    list-style: none;
    margin: 0;
    padding: 0;
    /* 上限まで貯まっても畳の外へはみ出さない。 */
    max-height: 240px;
    overflow-y: auto;
  }

  .recent-item {
    display: flex;
    align-items: center;
    border-radius: var(--radius-sm);
  }

  .recent-item:hover {
    background: var(--bg-hover);
  }

  .recent-pick {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    height: 28px;
    padding: 0 var(--space-2);
    border: none;
    background: transparent;
    color: var(--text-secondary);
    font-size: var(--text-sm-size);
    text-align: left;
    cursor: pointer;
  }

  .recent-pick:hover {
    color: var(--text-primary);
  }

  .recent-pick:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .recent-pick:focus-visible,
  .recent-forget:focus-visible {
    outline: none;
    box-shadow: inset 0 0 0 2px var(--accent);
  }

  .recent-name {
    flex: none;
    white-space: nowrap;
  }

  /* 親パスは同名フォルダの見分け用の補助情報。入り切らない分は省略し、全体は title で見せる。 */
  .recent-parent {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    text-align: right;
    font-size: var(--text-2xs-size);
    color: var(--text-tertiary);
  }

  .recent-badge {
    flex: none;
    font-size: var(--text-2xs-size);
    color: var(--danger-fg);
  }

  /* 見つからないフォルダは畳まず残す（繋ぎ直せば使えるため）。押せるが薄く見せる。 */
  .recent-item.missing .recent-name {
    color: var(--text-tertiary);
    text-decoration: line-through;
  }

  .recent-forget {
    flex: none;
    width: 20px;
    height: 20px;
    margin-right: var(--space-1);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: var(--radius-full);
    background: transparent;
    color: var(--text-tertiary);
    font-size: 10px;
    line-height: 1;
    cursor: pointer;
    /* 誤って履歴を消さないよう、行に触れるまでは出さない。 */
    opacity: 0;
  }

  .recent-item:hover .recent-forget,
  .recent-forget:focus-visible {
    opacity: 1;
  }

  .recent-forget:hover {
    background: var(--bg-app);
    color: var(--danger-fg);
  }

  /* ── ファイル名フィルタ ───────────────────────────────────── */
  .filter {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    height: 28px;
    margin: 0 var(--space-2) var(--space-1);
    padding: 0 var(--space-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg-app);
    flex: none;
    transition:
      border-color var(--dur-fast) var(--ease),
      box-shadow var(--dur-fast) var(--ease);
  }

  .filter:focus-within {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-subtle);
  }

  .filter.active:not(:focus-within) {
    border-color: var(--border-strong);
  }

  .filter-ico {
    width: 13px;
    height: 13px;
    flex: none;
    color: var(--text-tertiary);
  }

  .filter-input {
    flex: 1;
    min-width: 0;
    height: 100%;
    border: none;
    background: transparent;
    color: var(--text-primary);
    font-size: var(--text-xs-size);
    outline: none;
  }

  .filter-input::placeholder {
    color: var(--text-tertiary);
  }

  .filter-clear {
    flex: none;
    width: 16px;
    height: 16px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: var(--radius-full);
    background: transparent;
    color: var(--text-tertiary);
    font-size: 10px;
    line-height: 1;
    cursor: pointer;
  }

  .filter-clear:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-4);
    padding: var(--space-5);
    text-align: center;
  }

  .hint {
    margin: 0;
    /* 文言の改行は \n（翻訳キー内）を pre-line で反映する。 */
    white-space: pre-line;
    font-size: var(--text-xs-size);
    line-height: 1.6;
    color: var(--text-tertiary);
  }

  .open {
    height: 32px;
    padding: 0 var(--space-4);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-md);
    background: var(--bg-elevated);
    color: var(--text-secondary);
    font-size: var(--text-sm-size);
    cursor: pointer;
  }

  .open:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .banner {
    margin: 0;
    padding: var(--space-2) var(--space-4);
    font-size: var(--text-2xs-size);
    line-height: 1.5;
  }

  .banner.err {
    color: var(--danger-fg);
    background: var(--danger-subtle, transparent);
  }

  .banner.warn {
    color: var(--warning-fg, var(--text-secondary));
    flex: none;
  }

  .tree {
    flex: 1;
    min-height: 0;
    /* 深い階層は省略記号で潰さず横スクロールで見せる（縦横 auto）。 */
    overflow: auto;
    list-style: none;
    margin: 0;
    padding: var(--space-1) 0;
  }

  .row {
    /* インデントは depth に比例。行は内容幅（max-content）まで伸び、
       パネルより深い階層は .tree の横スクロールで辿れる。min-width:100% で
       浅い行のホバー地はパネル全幅に届かせる。 */
    width: max-content;
    min-width: 100%;
    display: flex;
    align-items: center;
    gap: var(--space-1);
    height: 26px;
    padding: 0 var(--space-3) 0 calc(var(--space-3) + var(--depth) * 14px);
    border: none;
    background: transparent;
    color: var(--text-secondary);
    font-size: var(--text-sm-size);
    text-align: left;
    cursor: pointer;
  }

  .row:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .row.active {
    background: var(--accent-subtle);
    color: var(--accent);
  }

  /* クリック/キーボードで選択中の行。WebView 既定のフォーカス枠を打ち消し、
     アプリ調のアクセント枠に統一する。 */
  .row:focus-visible {
    outline: none;
    box-shadow: inset 0 0 0 2px var(--accent);
  }

  .caret {
    width: 14px;
    height: 14px;
    flex: none;
    color: var(--text-tertiary);
    transition: transform 120ms ease;
  }

  .caret.expanded {
    transform: rotate(90deg);
  }

  /* ファイル行はシェブロン非表示。span.spacer は .caret の幅で桁を合わせる。 */
  span.caret.spacer {
    display: inline-block;
  }

  .ico {
    width: 16px;
    height: 16px;
    flex: none;
    color: var(--text-tertiary);
  }

  /* フォルダは 1 段目立たせる。ファイルは拡張子で色分け（Phase D 先取り）。 */
  .ico.folder {
    color: var(--accent);
  }

  .ico.file.md {
    color: #4c8bf5; /* Markdown = 青系 */
  }

  .ico.file.tsv {
    color: #3fa66a; /* TSV（表データ）= 緑系 */
  }

  .name {
    /* 省略記号で切らず、深い階層は横スクロールで全名を見せる。 */
    white-space: nowrap;
  }

  /* git マーク（右肩バッジ）。行末に寄せ、変更種別ごとに VSCode 風配色。
     min-width:100% の行内で margin-left:auto によりパネル右端へ寄る。 */
  .git-mark {
    margin-left: auto;
    padding-left: var(--space-2);
    flex: none;
    font-size: var(--text-2xs-size);
    font-weight: 700;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }

  /* VSCode gitDecoration 準拠（明暗どちらでも読める中間トーン）。
     名前テキストとバッジを同色に揃える。 */
  .row[data-git='modified'] .name,
  .row[data-git='renamed'] .name,
  .row[data-git='modified'] .git-mark,
  .row[data-git='renamed'] .git-mark {
    color: #d9a441; /* 変更 = 黄土 */
  }

  .row[data-git='untracked'] .name,
  .row[data-git='added'] .name,
  .row[data-git='untracked'] .git-mark,
  .row[data-git='added'] .git-mark {
    color: #4ca66a; /* 新規 / 追加 = 緑 */
  }

  .row[data-git='deleted'] .name,
  .row[data-git='deleted'] .git-mark {
    color: #c7502f; /* 削除 = 赤 */
  }

  .row[data-git='conflicted'] .name,
  .row[data-git='conflicted'] .git-mark {
    color: #c94f6d; /* コンフリクト = 赤紫 */
  }

  /* 選択中はアクセント色を優先（マーク文字は色付けのまま桁だけ保つ）。 */
  .row.active .name {
    color: var(--accent);
  }

  /* ── 右クリックコンテキストメニュー ───────────────────────────── */
  /* クリック外し用の透明バックドロップ。ビューポート全面を覆い、メニュー以外への
     クリックで閉じる。ボタン要素だが枠・地は透明で見えない。 */
  .menu-backdrop {
    position: fixed;
    inset: 0;
    z-index: 90;
    border: none;
    padding: 0;
    background: transparent;
    cursor: default;
  }

  .ctx-menu {
    position: fixed;
    z-index: 91;
    min-width: 180px;
    margin: 0;
    padding: var(--space-1);
    list-style: none;
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    box-shadow: 0 6px 20px rgb(0 0 0 / 0.28);
  }

  .ctx-item {
    display: block;
    width: 100%;
    padding: var(--space-1) var(--space-3);
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-secondary);
    font-size: var(--text-sm-size);
    text-align: left;
    white-space: nowrap;
    cursor: pointer;
  }

  .ctx-item:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .ctx-item:focus-visible {
    outline: none;
    box-shadow: inset 0 0 0 2px var(--accent);
    color: var(--text-primary);
  }
</style>
