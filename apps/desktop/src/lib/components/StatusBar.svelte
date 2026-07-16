<script lang="ts">
  // Phase 1b 骨格。Git 変更数 / Commit / forge 種別 / MCP は後続フェーズ
  // （3 Git・フォージ / 4 以降 MCP）で実データに置き換える。
  // Push は baseline §6 / DESIGN §7.4 により「人間のみ」の視覚シグナルを固定で表現する。
</script>

<footer class="statusbar">
  <div class="left">
    <span class="muted">リポジトリ未接続</span>
    <button class="chip" type="button" disabled title="コミット（Git 連携フェーズ）">Commit</button>
    <button
      class="chip push"
      type="button"
      disabled
      title="push は人間が確認して実行します（baseline §6）"
    >
      <span class="warn" aria-hidden="true">⚠</span> Push
    </button>
  </div>

  <div class="right">
    <span class="ind"><span class="dot neutral" aria-hidden="true"></span>forge: 未判定</span>
    <span class="ind"><span class="dot neutral" aria-hidden="true"></span>MCP: 未接続</span>
  </div>
</footer>

<style>
  .statusbar {
    height: var(--statusbar-h);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: 0 var(--space-4);
    background: var(--bg-subtle);
    border-top: 1px solid var(--border);
    font-size: var(--text-xs-size);
    color: var(--text-secondary);
    user-select: none;
  }

  .left,
  .right {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .muted {
    color: var(--text-tertiary);
  }

  .chip {
    height: 22px;
    padding: 0 var(--space-2);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    background: var(--bg-elevated);
    color: var(--text-secondary);
    font-size: var(--text-xs-size);
    cursor: pointer;
  }

  .chip:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .chip.push {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .warn {
    color: var(--warning-fg);
  }

  .ind {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .dot {
    width: 7px;
    height: 7px;
    border-radius: var(--radius-full);
    flex: none;
  }

  .dot.neutral {
    background: var(--text-tertiary);
  }
</style>
