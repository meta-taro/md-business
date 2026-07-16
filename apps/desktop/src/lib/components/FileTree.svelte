<script lang="ts">
  // Phase 1b 骨格の左レール。実ファイル走査 / 6 スキーマ別アイコン色（DESIGN §2.4）/
  // 選択状態は Phase 1c（registry・detect 移植）で接続する。ここでは空状態の器のみ。
</script>

<nav class="filetree" aria-label="ファイルツリー">
  <div class="head">
    <span class="title">エクスプローラー</span>
  </div>

  <div class="empty">
    <p class="hint">フォルダを開くと<br />文書ツリーが表示されます</p>
    <button class="open" type="button" disabled title="フォルダを開く（Git 連携フェーズ）">
      フォルダを開く
    </button>
  </div>
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
    padding: 0 var(--space-4);
    flex: none;
  }

  .title {
    font-size: var(--text-2xs-size);
    font-weight: var(--text-2xs-weight);
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-tertiary);
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
</style>
