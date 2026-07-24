<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { createMarkdownEditor, type MarkdownEditorHandle } from './markdownEditor';
  import { createEditorSearchBinding } from './editorSearchBinding';
  import { search } from '$lib/search/search.svelte';
  import type { EditorFocusInfo } from '$lib/layout/scrollSync';

  // 親から初期値を受け取り、編集は onChange で親へ返す（一方向）。source の
  // 外部差し替え（Phase 3 ファイルオープン）は $effect で setDoc に反映する。
  interface Props {
    value: string;
    onChange: (value: string) => void;
    onSync?: (info: EditorFocusInfo) => void;
  }
  const { value, onChange, onSync }: Props = $props();

  let host = $state<HTMLDivElement | null>(null);
  let editor: MarkdownEditorHandle | undefined;

  onMount(() => {
    if (!host) return;
    editor = createMarkdownEditor({
      parent: host,
      doc: value,
      onChange,
      onSync,
      // Ctrl/Cmd+F で共通 SearchBar をエディター対象で開く。
      onFind: () => search.openFor('editor'),
    });
    // 共通検索ストアへエディターの検索操作を登録（SearchBar から driven される）。
    search.register('editor', createEditorSearchBinding(editor.view, search.report));
  });

  onDestroy(() => {
    search.unregister('editor');
    editor?.destroy();
    editor = undefined;
  });

  // 親側で value がプログラム的に差し替わった場合のみ editor に反映（setDoc は
  // 現在値と一致すればスキップ＝ユーザー入力のエコーバックでは何もしない）。
  $effect(() => {
    const next = value;
    if (editor && editor.getDoc() !== next) {
      editor.setDoc(next);
    }
  });
</script>

<div class="cm-host" bind:this={host}></div>

<style>
  .cm-host {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  /* CodeMirror の scroller に縦スクロールを持たせる（ホストは overflow:hidden）。 */
  .cm-host :global(.cm-editor) {
    height: 100%;
  }

  .cm-host :global(.cm-scroller) {
    overflow: auto;
  }
</style>
