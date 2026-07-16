<script lang="ts">
  import { onMount } from 'svelte';
  import '../app.css';
  import { themeController } from '$lib/theme.svelte';
  import TopBar from '$lib/components/TopBar.svelte';
  import StatusBar from '$lib/components/StatusBar.svelte';
  import FileTree from '$lib/components/FileTree.svelte';
  import SidePanel from '$lib/components/SidePanel.svelte';

  // Svelte 5 runes: 子ルート（+page）はエディター↔プレビュー分割を描画する。
  let { children } = $props();

  // Git / AI / MCP パネルは既定で畳む（DESIGN §6・エディター↔プレビューを広く）。
  let panelOpen = $state(false);

  onMount(() => {
    // app.html が paint 前に data-theme を確定済み。ここで反応状態を種づけして
    // トグルボタンの表示を実テーマに一致させる（DESIGN §8）。
    themeController.init();
  });
</script>

<div class="shell">
  <TopBar />

  <div class="body">
    <FileTree />
    <main class="center">
      {@render children()}
    </main>
    <SidePanel open={panelOpen} ontoggle={() => (panelOpen = !panelOpen)} />
  </div>

  <StatusBar />
</div>

<style>
  .shell {
    height: 100vh;
    display: grid;
    grid-template-rows: var(--topbar-h) 1fr var(--statusbar-h);
    background: var(--bg-app);
    color: var(--text-primary);
    overflow: hidden;
  }

  .body {
    display: grid;
    grid-template-columns: var(--filetree-w) minmax(0, 1fr) auto;
    min-height: 0;
  }

  .center {
    min-width: 0;
    min-height: 0;
    background: var(--bg-app);
    overflow: hidden;
  }
</style>
