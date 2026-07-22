<script lang="ts">
  // 左レール。共有 workspace ストアのツリーを描画し、フォルダ開閉・ファイル選択を配線する
  // （DOC-SPEC-DESKTOP-2026-0001 §3.3 / §6.1）。走査・読込は Rust コマンド、可視行の
  // 平坦化は workspaceLogic の純関数（単体テスト済み）に委譲する。スキーマ別アイコン色・
  // 選択ハイライトの仕上げは Phase D。
  import { workspace } from '$lib/workspace/workspace.svelte';
  import {
    flattenVisible,
    filterTree,
    collectFolderPaths,
  } from '$lib/workspace/workspaceLogic';
  import { git } from '$lib/git/git.svelte';
  import { gitMarkLetter, type GitFileState } from '$lib/git/gitStatus';

  // git 状態 → ホバー説明（バッジ title）。色マークの意味を言葉でも補う。
  const GIT_TITLE: Record<GitFileState, string> = {
    modified: '変更あり（未コミット）',
    added: 'ステージ済みの追加',
    untracked: '未追跡（新規）',
    deleted: '削除',
    renamed: 'リネーム',
    conflicted: 'コンフリクト',
  };

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
      void workspace.select(path);
    }
  }

  // Esc でフィルタをクリア（入力が空なら何もしない）。
  function onFilterKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape' && filterQuery !== '') {
      e.preventDefault();
      filterQuery = '';
    }
  }
</script>

<nav class="filetree" class:collapsed aria-label="ファイルツリー">
  {#if collapsed}
    <!-- 折り畳み時は縦レールのみ。› で開く（SidePanel の ‹ › と対称）。 -->
    <button
      class="rail-toggle"
      type="button"
      onclick={ontoggle}
      title="エクスプローラーを開く"
      aria-label="エクスプローラーを開く"
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
        title="エクスプローラーを畳む"
        aria-label="エクスプローラーを畳む"
      >
        ‹
      </button>
      <span class="title">エクスプローラー</span>
    </div>
    {#if workspace.root !== null}
      <button
        class="reopen"
        type="button"
        onclick={() => workspace.openFolder()}
        title="別のフォルダを開く"
        aria-label="別のフォルダを開く"
      >
        開く
      </button>
    {/if}
  </div>

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
        placeholder="ファイル名で絞り込み"
        spellcheck="false"
        autocomplete="off"
        aria-label="ファイル名で絞り込み"
        onkeydown={onFilterKeydown}
      />
      {#if filterQuery !== ''}
        <button
          class="filter-clear"
          type="button"
          onclick={() => (filterQuery = '')}
          title="フィルタをクリア（Esc）"
          aria-label="フィルタをクリア"
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
      <p class="hint">フォルダを開くと<br />文書ツリーが表示されます</p>
      <button
        class="open"
        type="button"
        onclick={() => workspace.openFolder()}
        disabled={workspace.loading}
      >
        {workspace.loading ? '読み込み中…' : 'フォルダを開く'}
      </button>
    </div>
  {:else if rows.length === 0}
    <!-- フィルタで 0 件 か 空フォルダ かで文言を分ける。 -->
    <div class="empty">
      {#if filtering}
        <p class="hint">「{filterQuery.trim()}」に<br />一致するファイルがありません</p>
      {:else}
        <p class="hint">.md / .tsv が<br />見つかりませんでした</p>
      {/if}
    </div>
  {:else}
    <ul class="tree">
      {#each rows as row (row.node.path)}
        {@const node = row.node}
        {@const gitState = node.kind === 'file' ? git.stateOf(node.path) : null}
        <li>
          <button
            class="row"
            class:active={node.kind === 'file' && workspace.activePath === node.path}
            type="button"
            style="--depth: {row.depth}"
            data-git={gitState}
            onclick={() => onRowClick(node.path, node.kind)}
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
              <span class="git-mark" title={GIT_TITLE[gitState]}>{gitMarkLetter(gitState)}</span>
            {/if}
          </button>
        </li>
      {/each}
    </ul>

    {#if workspace.truncated}
      <p class="banner warn" role="status">一部のみ表示（上限に達したため打ち切りました）</p>
    {/if}
  {/if}
  {/if}
</nav>

<style>
  .filetree {
    height: 100%;
    display: flex;
    flex-direction: column;
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
</style>
