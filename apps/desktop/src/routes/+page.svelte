<script lang="ts">
  import { themeController } from '$lib/theme.svelte';
  import { renderApiSpecPreview } from '$lib/preview/apiSpecPreview';
  import { apiSpecSample } from '$lib/samples/apiSpecSample';

  // 中央 = 左右 2 分割（DESIGN §6）。左＝Markdown エディター（Phase 2 で
  // CodeMirror 6）、右＝ビューワー（Phase 1c で renderer-pdf の HTML を iframe 隔離）。
  //
  // ファイルオープン（Phase 3）・エディター（Phase 2）が未実装の間は、正本テンプレを
  // seed として表示し、api-spec ビューワーが実際に描画されることを示す。source は
  // Phase 2 で CodeMirror に双方向バインドする（今はエディター側は読み取り表示のみ）。
  let source = $state(apiSpecSample);

  // テーマ変更に追従して iframe 内 <html data-theme> も一致させる（別ドキュメントなので
  // アプリの data-theme は継承されない）。$derived で source / theme の変化に即再描画。
  const preview = $derived(renderApiSpecPreview(source, { theme: themeController.value }));
</script>

<div class="split">
  <section class="pane editor" aria-label="Markdown エディター">
    <div class="pane-head">エディター（Phase 2 で編集可能化）</div>
    <textarea
      class="editor-seed"
      bind:value={source}
      spellcheck="false"
      aria-label="Markdown ソース"
    ></textarea>
  </section>

  <section class="pane preview" aria-label="ビューワー（プレビュー）">
    <div class="pane-head">プレビュー — API 設計書</div>
    {#if preview.ok}
      <iframe class="viewer" srcdoc={preview.srcdoc} title="API 設計書プレビュー"></iframe>
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
        <span class="env">API 設計書（endpoints / エンドポイント）を開いてください</span>
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

  /* Phase 1c 暫定エディター：Phase 2 で CodeMirror 6 に置換。今は seed を編集して
     プレビュー即同期を確認できる素の textarea。 */
  .editor-seed {
    flex: 1;
    min-height: 0;
    width: 100%;
    resize: none;
    border: none;
    outline: none;
    padding: var(--space-4);
    background: var(--bg-app);
    color: var(--text-primary);
    font-family: var(--font-mono);
    font-size: var(--text-xs-size);
    line-height: 1.6;
    tab-size: 2;
  }

  .editor-seed:focus-visible {
    box-shadow: inset 0 0 0 2px var(--accent-subtle);
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
