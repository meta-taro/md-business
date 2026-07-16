<script lang="ts">
  // Svelte 5 runes: 子ルートは children スニペットとして受け取り描画する。
  // アプリシェル（トップバー / レイアウト骨格）は Phase 1b で本 layout に実装する。
  let { children } = $props();
</script>

{@render children()}
