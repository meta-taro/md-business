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
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
