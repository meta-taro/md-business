<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { createMarkdownEditor, type MarkdownEditorHandle } from './markdownEditor';
  import { createEditorSearchBinding } from './editorSearchBinding';
  import { search } from '$lib/search/search.svelte';
  import type { EditorFocusInfo } from '$lib/layout/scrollSync';

  // 親から初期値を受け取り、編集は onChange で親へ返す（一方向）。source の
  // 外部差し替え（別ファイルを開いた等）は $effect で setDoc に反映する。
  interface Props {
    value: string;
    onChange: (value: string) => void;
    onSync?: (info: EditorFocusInfo) => void;
    /** 参考データ（.json / .xml）を開いている間は編集させない。 */
    readOnly?: boolean;
    /**
     * 外から指定するカーソル位置（別ファイルの見出しをリンクで指されたとき）。
     *
     * `seq` は同じ位置を続けて指されても動くための連番。位置だけだと「同じ＝変化なし」
     * になり、開き直しても寄らない。
     */
    caret?: { offset: number; seq: number } | null;
  }
  const { value, onChange, onSync, readOnly = false, caret = null }: Props = $props();

  let host = $state<HTMLDivElement | null>(null);
  let editor: MarkdownEditorHandle | undefined;

  onMount(() => {
    if (!host) return;
    editor = createMarkdownEditor({
      parent: host,
      doc: value,
      onChange,
      onSync,
      readOnly,
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
  // ここで getDoc と突き合わせると、本文全体の文字列化が 1 回の編集につき 2 回になる。
  $effect(() => {
    const next = value;
    editor?.setDoc(next);
  });

  $effect(() => {
    editor?.setReadOnly(readOnly);
  });

  // 外から指定された位置へ寄せる。本文は先に差し替わっているので、ここでは位置だけを見る。
  let lastCaretSeq = -1;
  $effect(() => {
    if (caret === null || caret.seq === lastCaretSeq) return;
    lastCaretSeq = caret.seq;
    editor?.revealOffset(caret.offset);
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
