<script lang="ts">
  import { themeController } from '$lib/theme.svelte';
  import { renderPreview } from '$lib/preview/renderPreview';
  import { apiSpecSample } from '$lib/samples/apiSpecSample';
  import CodeMirrorEditor from '$lib/editor/CodeMirrorEditor.svelte';
  import { debounce } from '$lib/util/debounce';

  // 中央 = 左右 2 分割（DESIGN §6）。左＝Markdown エディター（CodeMirror 6・
  // Phase 2）、右＝ビューワー（Phase 1c で renderer-pdf の HTML を iframe 隔離）。
  //
  // ファイルオープン（Phase 3）が未実装の間は、正本テンプレを seed として開く。
  // source が編集の唯一の真実。エディター編集 → debounce → 再描画（§6.2）。
  let source = $state(apiSpecSample);
  // debounce 後の値。プレビューはこちらから描画し、タイプ中の再描画連打を抑える。
  let debouncedSource = $state(apiSpecSample);

  // §6.2 既定 200ms。最後の入力から 200ms 静止で 1 回だけプレビューへ反映。
  const pushToPreview = debounce((value: string) => {
    debouncedSource = value;
  }, 200);

  function handleEditorChange(value: string): void {
    source = value;
    pushToPreview(value);
  }

  // frontmatter を registry で振り分け、該当スキーマのビューワーで描画する（6 スキーマ
  // 自動判定・Phase 2b）。テーマ変更に追従して iframe 内 <html data-theme> も一致させる
  // （別ドキュメントなのでアプリの data-theme は継承されない）。debouncedSource / theme の
  // 変化で即再描画。
  const preview = $derived(
    renderPreview(debouncedSource, { theme: themeController.value }),
  );
</script>

<div class="split">
  <section class="pane editor" aria-label="Markdown エディター">
    <div class="pane-head">エディター — Markdown</div>
    <CodeMirrorEditor value={source} onChange={handleEditorChange} />
  </section>

  <section class="pane preview" aria-label="ビューワー（プレビュー）">
    <div class="pane-head">プレビュー{#if preview.ok} — {preview.label}{/if}</div>
    {#if preview.ok}
      <iframe class="viewer" srcdoc={preview.srcdoc} title="{preview.label}プレビュー"></iframe>
      {#if preview.errors.length > 0 || preview.warnings.length > 0}
        <div class="notices" role="status">
          {#each preview.errors as err (err)}
            <span class="notice err">{err}</span>
          {/each}
          {#each preview.warnings as warn (warn)}
            <span class="notice warn">{warn}</span>
          {/each}
        </div>
      {/if}
    {:else}
      <div class="pane-empty">
        <p class="hint">{preview.reason}</p>
        <span class="env">請求書 / 検証シート / 基本設計書 / DB 設計書 / NoSQL 設計書 / API 設計書 を開いてください</span>
      </div>
    {/if}
  </section>
</div>

<style>
  .split {
    height: 100%;
    display: grid;
    grid-template-columns: minmax(var(--pane-min), 1fr) minmax(var(--pane-min), 1fr);
    min-height: 0;
  }

  .pane {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  .pane.editor {
    border-right: 1px solid var(--border);
  }

  .pane-head {
    height: 34px;
    display: flex;
    align-items: center;
    padding: 0 var(--space-4);
    flex: none;
    font-size: var(--text-2xs-size);
    font-weight: var(--text-2xs-weight);
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-tertiary);
    border-bottom: 1px solid var(--border);
  }

  .pane-empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-4);
    padding: var(--space-6);
    text-align: center;
  }

  .viewer {
    flex: 1;
    min-height: 0;
    width: 100%;
    border: none;
    background: var(--bg-app);
  }

  .notices {
    flex: none;
    max-height: 30%;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding: var(--space-2) var(--space-4);
    border-top: 1px solid var(--border);
    background: var(--bg-subtle);
  }

  .notice {
    font-size: var(--text-2xs-size);
    line-height: 1.5;
  }

  .notice.err {
    color: var(--danger-fg);
  }

  .notice.warn {
    color: var(--warning-fg, var(--text-secondary));
  }

  .hint {
    margin: 0;
    font-size: var(--text-sm-size);
    line-height: 1.7;
    color: var(--text-tertiary);
  }

  .env {
    font-size: var(--text-xs-size);
    padding: var(--space-1) var(--space-3);
    border-radius: var(--radius-full);
    background: var(--accent-subtle);
    color: var(--accent);
  }

  /* < 768px: 左右分割をやめ縦積み（DESIGN §7.1・簡易対応。タブ切替は後続） */
  @media (max-width: 767px) {
    .split {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: 1fr 1fr;
    }

    .pane.editor {
      border-right: none;
      border-bottom: 1px solid var(--border);
    }
  }
</style>
