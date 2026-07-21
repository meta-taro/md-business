<script lang="ts">
  // 左レール。共有 workspace ストアのツリーを描画し、フォルダ開閉・ファイル選択を配線する
  // （DOC-SPEC-DESKTOP-2026-0001 §3.3 / §6.1）。走査・読込は Rust コマンド、可視行の
  // 平坦化は workspaceLogic の純関数（単体テスト済み）に委譲する。スキーマ別アイコン色・
  // 選択ハイライトの仕上げは Phase D。
  import { workspace } from '$lib/workspace/workspace.svelte';
  import { flattenVisible } from '$lib/workspace/workspaceLogic';

  // 展開状態 or ツリー変化で可視行を再導出する。
  const rows = $derived(flattenVisible(workspace.tree, workspace.expanded));

  function onRowClick(path: string, kind: 'folder' | 'file'): void {
    if (kind === 'folder') {
      workspace.toggle(path);
    } else {
      void workspace.select(path);
    }
  }
</script>

<nav class="filetree" aria-label="ファイルツリー">
  <div class="head">
    <span class="title">エクスプローラー</span>
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
    <!-- 空フォルダ -->
    <div class="empty">
      <p class="hint">.md / .tsv が<br />見つかりませんでした</p>
    </div>
  {:else}
    <ul class="tree">
      {#each rows as row (row.node.path)}
        {@const node = row.node}
        <li>
          <button
            class="row"
            class:active={node.kind === 'file' && workspace.activePath === node.path}
            type="button"
            style="--depth: {row.depth}"
            onclick={() => onRowClick(node.path, node.kind)}
            title={node.path}
          >
            {#if node.kind === 'folder'}
              <span class="caret" class:open={workspace.expanded.has(node.path)} aria-hidden="true"
                >▸</span
              >
              <span class="ico folder" aria-hidden="true">▪</span>
            {:else}
              <span class="caret spacer" aria-hidden="true"></span>
              <span class="ico file {node.ext}" aria-hidden="true">●</span>
            {/if}
            <span class="name">{node.name}</span>
          </button>
        </li>
      {/each}
    </ul>

    {#if workspace.truncated}
      <p class="banner warn" role="status">一部のみ表示（上限に達したため打ち切りました）</p>
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

  .head {
    height: 34px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 var(--space-3) 0 var(--space-4);
    flex: none;
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
    overflow-y: auto;
    list-style: none;
    margin: 0;
    padding: var(--space-1) 0;
  }

  .row {
    /* インデントは depth に比例。ファイル名は省略記号で切る。 */
    width: 100%;
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

  .caret {
    width: 12px;
    flex: none;
    font-size: 9px;
    color: var(--text-tertiary);
    transition: transform 120ms ease;
  }

  .caret.open {
    transform: rotate(90deg);
  }

  /* .caret.spacer はファイル行の桁合わせ用。追加スタイル不要（.caret の幅を流用）。 */

  .ico {
    width: 12px;
    flex: none;
    font-size: 9px;
    text-align: center;
    color: var(--text-tertiary);
  }

  .name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
