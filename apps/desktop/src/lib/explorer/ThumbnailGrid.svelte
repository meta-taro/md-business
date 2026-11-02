<script lang="ts">
  // 左レールのサムネイル格子。ツリーと切り替えて使う。起動時には読まず、格子へ切り替えた
  // ときに FileTree が読み込む（起動前に読む JS を増やさないため）。
  import { workspace } from '$lib/workspace/workspace.svelte';
  import { themeController } from '$lib/theme.svelte';
  import { t } from '$lib/i18n/i18n.svelte';
  import type { TreeNode } from '$lib/workspace/fileTree';
  import { folderTrail, gridItems, type GridItem } from './thumbnailGrid';
  import { loadThumbnail, type Thumbnail } from './thumbnailLoader';

  let {
    tree,
    filtering,
    onopen,
  }: {
    tree: readonly TreeNode[];
    filtering: boolean;
    onopen: (path: string) => void;
  } = $props();

  // 開いている文書のフォルダから見せる。ツリーから切り替えた直後に、今いる場所が分かるように。
  function initialFolder(): string {
    const path = workspace.activePath;
    if (path === null) return '';
    const slash = path.lastIndexOf('/');
    return slash < 0 ? '' : path.slice(0, slash);
  }
  let folder = $state(initialFolder());

  const items = $derived(gridItems(tree, folder, filtering));
  const trail = $derived(folderTrail(folder));

  // 見えたカードだけ読む。大きなフォルダで、画面外の何百枚を先に読みに行かない。
  function whenVisible(node: HTMLElement, onvisible: () => void): { destroy: () => void } {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          observer.disconnect();
          onvisible();
        }
      },
      { rootMargin: '120px' },
    );
    observer.observe(node);
    return { destroy: () => observer.disconnect() };
  }

  let thumbs = $state<Record<string, Thumbnail>>({});
  // テーマを替えた・走査し直した・別のフォルダを開いたら、描き直す側へ回す。
  $effect(() => {
    void themeController.value;
    void workspace.scanGeneration;
    void workspace.root;
    thumbs = {};
  });

  function request(item: GridItem): void {
    const root = workspace.root;
    if (root === null) return;
    const generation = workspace.scanGeneration;
    const theme = themeController.value;
    void loadThumbnail({ root, path: item.path, theme, generation }).then((thumb) => {
      // 読んでいる間に走査し直していたら、古い絵は置かない
      if (workspace.scanGeneration !== generation || workspace.root !== root) return;
      if (themeController.value !== theme) return;
      thumbs = { ...thumbs, [item.path]: thumb };
    });
  }

  function onCard(item: GridItem): void {
    if (item.kind === 'folder') folder = item.path;
    else onopen(item.path);
  }

  function extLabel(name: string): string {
    const dot = name.lastIndexOf('.');
    return dot <= 0 ? '' : name.slice(dot + 1);
  }

  // 文書は A4 縦の幅で描いて縮める。縮める率はカードの実寸から割り出す。
  const FRAME_WIDTH = 794;
  const FRAME_HEIGHT = 1123;
  let cardWidth = $state(120);
  const scale = $derived(cardWidth / FRAME_WIDTH);
</script>

{#if !filtering}
  <nav class="trail" aria-label={t('tree.gridTrail')}>
    <button class="step" type="button" onclick={() => (folder = '')} disabled={folder === ''}>
      {t('tree.gridTop')}
    </button>
    {#each trail as step (step.path)}
      <span class="sep" aria-hidden="true">/</span>
      <button
        class="step"
        type="button"
        onclick={() => (folder = step.path)}
        disabled={step.path === folder}
      >
        {step.name}
      </button>
    {/each}
  </nav>
{/if}

{#if items.length === 0}
  <p class="empty">{t('tree.gridEmpty')}</p>
{:else}
  <ul class="grid">
    {#each items as item (item.path)}
      {@const thumb = thumbs[item.path]}
      <li>
        <button
          class="card"
          class:active={workspace.activePath === item.path}
          type="button"
          title={item.path}
          onclick={() => onCard(item)}
        >
          <span class="pic {item.kind}" bind:clientWidth={cardWidth}>
            {#if item.kind === 'folder'}
              <svg class="mark" viewBox="0 0 16 16" aria-hidden="true">
                <path
                  d="M1.5 4A1.5 1.5 0 013 2.5h3.3l1.2 1.4H13A1.5 1.5 0 0114.5 5.4v6.1A1.5 1.5 0 0113 13H3a1.5 1.5 0 01-1.5-1.5z"
                  fill="currentColor"
                />
              </svg>
            {:else if item.kind === 'none'}
              <span class="ext" aria-hidden="true">{extLabel(item.name)}</span>
            {:else if thumb === undefined}
              <span class="wait" use:whenVisible={() => request(item)}></span>
            {:else if thumb.type === 'image'}
              <img src={thumb.src} alt="" decoding="async" />
            {:else if thumb.type === 'document'}
              <!-- 縮めた絵として見せるだけ。中のスクリプトは動かさず、押されたらカードが受ける。 -->
              <iframe
                class="doc"
                title={item.name}
                sandbox=""
                tabindex="-1"
                aria-hidden="true"
                srcdoc={thumb.srcdoc}
                style:width="{FRAME_WIDTH}px"
                style:height="{FRAME_HEIGHT}px"
                style:transform="scale({scale})"
              ></iframe>
            {:else}
              <span class="ext" aria-hidden="true">{extLabel(item.name)}</span>
            {/if}
          </span>
          <span class="name">{item.name}</span>
          {#if filtering}
            <span class="path">{item.path}</span>
          {/if}
        </button>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .trail {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 2px;
    padding: var(--space-1) var(--space-3);
    font-size: var(--text-xs-size);
  }

  .step {
    padding: 1px var(--space-1);
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--accent);
    cursor: pointer;
    font: inherit;
  }

  .step:hover:not(:disabled) {
    background: var(--bg-hover);
  }

  .step:disabled {
    color: var(--text-primary);
    cursor: default;
  }

  .step:focus-visible {
    outline: none;
    box-shadow: inset 0 0 0 2px var(--accent);
  }

  .sep {
    color: var(--text-tertiary);
  }

  .empty {
    margin: 0;
    padding: var(--space-3);
    color: var(--text-tertiary);
    font-size: var(--text-sm-size);
  }

  .grid {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(104px, 1fr));
    align-content: start;
    gap: var(--space-2);
    margin: 0;
    padding: var(--space-2) var(--space-3);
    list-style: none;
  }

  .card {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 4px;
    border: 1px solid transparent;
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--text-secondary);
    text-align: left;
    cursor: pointer;
    font: inherit;
  }

  .card:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .card.active {
    border-color: var(--accent);
    background: var(--accent-subtle);
    color: var(--accent);
  }

  .card:focus-visible {
    outline: none;
    box-shadow: inset 0 0 0 2px var(--accent);
  }

  .pic {
    position: relative;
    width: 100%;
    aspect-ratio: 210 / 297;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-sm);
    background: var(--bg-subtle);
  }

  .pic.folder,
  .pic.image,
  .pic.none {
    aspect-ratio: 4 / 3;
  }

  .pic.folder {
    color: var(--text-tertiary);
  }

  .mark {
    width: 40%;
    height: 40%;
  }

  .ext {
    color: var(--text-tertiary);
    font-size: var(--text-2xs-size);
    text-transform: uppercase;
  }

  .wait {
    position: absolute;
    inset: 0;
  }

  img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .doc {
    position: absolute;
    top: 0;
    left: 0;
    border: none;
    background: #fff;
    transform-origin: 0 0;
    pointer-events: none;
  }

  .name,
  .path {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-size: var(--text-xs-size);
  }

  .path {
    color: var(--text-tertiary);
    font-size: var(--text-2xs-size);
  }
</style>
