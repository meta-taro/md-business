<script lang="ts">
  // Git / AI / MCP パネル（DESIGN §6・既定は畳む）。開閉状態は親（+layout）が持ち、
  // グリッド幅を制御する。MCP タブは組み込みサーバーの接続情報と操作ログを表示する。
  import { t } from '$lib/i18n/i18n.svelte';
  import { mcp } from '$lib/mcp/mcp.svelte';
  import { formatLogTime } from '$lib/mcp/mcpLog';
  import { workspace } from '$lib/workspace/workspace.svelte';

  interface SidePanelProps {
    open: boolean;
    ontoggle: () => void;
  }

  let { open, ontoggle }: SidePanelProps = $props();

  const tabs = ['Git', 'Diff', 'AI', 'MCP'] as const;
  type Tab = (typeof tabs)[number];

  // 実装済みは MCP のみ。ほかは押せない状態にして、選択も MCP から始める。
  const enabled: Tab = 'MCP';
  let active = $state<Tab>(enabled);

  /** 直近に写した対象（ボタンの手応えを 1 つずつ出し分ける）。 */
  let copied = $state<'token' | 'config' | null>(null);
  let copyTimer: ReturnType<typeof setTimeout> | undefined;

  // 接続先 URL は訳す対象ではないので、翻訳が要る場合とだけ描き分ける。
  const connText = $derived(
    mcp.connection.kind === 'url' ? mcp.connection.url : t(mcp.connection.key),
  );

  /** 文字列を写し、どのボタンで写したかをしばらく表示する。 */
  async function copy(text: string | null, kind: 'token' | 'config'): Promise<void> {
    if (text === null) return;
    try {
      await navigator.clipboard.writeText(text);
      copied = kind;
      clearTimeout(copyTimer);
      copyTimer = setTimeout(() => {
        copied = null;
      }, 1500);
    } catch {
      // 書き込みが拒否される環境では黙って諦める（表示は変えない）。
    }
  }

  /** 設定の全文を組んでから写す。組むのはサーバー側なので、押した時点で取りに行く。 */
  async function copyConfig(): Promise<void> {
    try {
      await copy(await mcp.clientConfig(), 'config');
    } catch {
      // 接続できていなければ組めない。ボタンは接続中しか出ないので、表示は変えない。
    }
  }

  /** 設定を書き出した結果。書き出したパス、または失敗の理由。 */
  let wrote = $state<{ ok: boolean; detail: string } | null>(null);

  /** 開いているフォルダへ設定ファイルを置く。 */
  async function writeConfig(): Promise<void> {
    if (workspace.root === null) return;
    try {
      wrote = { ok: true, detail: await mcp.writeClientConfig(workspace.root) };
    } catch (err) {
      // 失敗の理由は書き出し先ごとに違う（読み取り専用・壊れた設定など）ので、原文を添える。
      wrote = { ok: false, detail: String(err) };
    }
  }
</script>

<aside class="sidepanel" class:open aria-label={t('panel.label')}>
  <button
    class="rail-toggle"
    type="button"
    onclick={ontoggle}
    aria-expanded={open}
    title={open ? t('panel.collapse') : t('panel.expand')}
  >
    {open ? '›' : '‹'}
  </button>

  {#if open}
    <div class="body">
      <div class="tabs" role="tablist">
        {#each tabs as tab (tab)}
          <button
            class="tab"
            class:active={tab === active}
            type="button"
            role="tab"
            aria-selected={tab === active}
            disabled={tab !== enabled}
            onclick={() => (active = tab)}
          >
            {tab}
          </button>
        {/each}
      </div>

      {#if active === 'MCP'}
        <div class="mcp">
          <div class="conn" data-state={mcp.status.state}>
            <span class="dot" aria-hidden="true"></span>
            <!-- サーバーが報告した原文は訳せないので、本文でなく詳細（tooltip）に添える。 -->
            <span class="conn-text" title={mcp.status.detail ?? connText}>{connText}</span>
          </div>

          {#if mcp.status.detail !== null}
            <!-- 理由の一文だけでは対処が決まらないので、サーバーが残した原文も出す。 -->
            <pre class="conn-detail">{mcp.status.detail}</pre>
          {/if}

          {#if mcp.isReady && mcp.status.token !== null}
            <!-- 置くだけで済む方を主にする。写して貼るのは、それを読まないクライアント向け。 -->
            {#if workspace.root !== null}
              <button class="token primary" type="button" onclick={writeConfig}>
                {t('mcp.writeConfig')}
              </button>
              <!-- 何が置かれるか（トークンが入る）を押す前に見せる。 -->
              <p class="note">{t('mcp.writeConfigNote')}</p>
              {#if wrote !== null}
                <p class="wrote" class:failed={!wrote.ok} title={wrote.detail}>
                  {wrote.ok ? t('mcp.wroteConfig') : t('mcp.writeConfigFailed')}
                </p>
              {/if}
            {/if}
            <button class="token" type="button" onclick={copyConfig}>
              {copied === 'config' ? t('mcp.copiedConfig') : t('mcp.copyConfig')}
            </button>
            <button class="token" type="button" onclick={() => copy(mcp.status.token, 'token')}>
              {copied === 'token' ? t('mcp.copied') : t('mcp.copyToken')}
            </button>
          {/if}

          <!-- 使い方が分からないと機能ごと気付かれないので、画面の中に置く。 -->
          <details class="howto">
            <summary>{t('mcp.howto')}</summary>
            <ol>
              <li>{t('mcp.howtoStep1')}</li>
              <li>{t('mcp.howtoStep2')}</li>
              <li>{t('mcp.howtoStep3')}</li>
            </ol>
            <p class="note">{t('mcp.howtoNote')}</p>
          </details>

          <ul class="logs">
            <!-- 同一ミリ秒に同じツールが並びうるので、キー付き each にはしない。 -->
            {#each mcp.logs as entry}
              <li class="log" class:failed={!entry.ok}>
                <span class="time">{formatLogTime(entry.ts)}</span>
                <span class="tool">{entry.tool}</span>
                {#if entry.path !== undefined}
                  <span class="path" title={entry.path}>{entry.path}</span>
                {/if}
                {#if entry.detail !== undefined}
                  <span class="detail" title={entry.detail}>{entry.detail}</span>
                {/if}
              </li>
            {:else}
              <li class="empty">
                {mcp.isReady ? t('mcp.logsEmpty') : t('mcp.logsDisabled')}
              </li>
            {/each}
          </ul>
        </div>
      {:else}
        <div class="content">
          <p class="hint">{t('panel.hint')}</p>
        </div>
      {/if}
    </div>
  {/if}
</aside>

<style>
  .sidepanel {
    height: 100%;
    width: 40px;
    display: flex;
    background: var(--bg-subtle);
    border-left: 1px solid var(--border);
    overflow: hidden;
    transition: width var(--dur-slow) var(--ease);
  }

  .sidepanel.open {
    width: var(--sidepanel-w);
  }

  .rail-toggle {
    width: 40px;
    flex: none;
    border: none;
    border-right: 1px solid var(--border);
    background: transparent;
    color: var(--text-tertiary);
    font-size: 16px;
    cursor: pointer;
    transition: background var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease);
  }

  .rail-toggle:hover {
    background: var(--bg-hover);
    color: var(--text-secondary);
  }

  .rail-toggle:focus-visible {
    outline: none;
    box-shadow: inset 0 0 0 2px var(--accent);
  }

  .body {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .tabs {
    height: 34px;
    display: flex;
    align-items: stretch;
    gap: var(--space-1);
    padding: 0 var(--space-2);
    border-bottom: 1px solid var(--border);
    flex: none;
  }

  .tab {
    padding: 0 var(--space-2);
    border: none;
    background: transparent;
    color: var(--text-tertiary);
    font-size: var(--text-xs-size);
    cursor: pointer;
  }

  .tab.active {
    color: var(--text-primary);
    box-shadow: inset 0 -2px 0 var(--accent);
  }

  .tab:disabled {
    cursor: default;
  }

  .content {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-5);
    text-align: center;
  }

  .hint {
    margin: 0;
    /* 文言の改行は \n（翻訳キー内）を pre-line で反映する。 */
    white-space: pre-line;
    font-size: var(--text-xs-size);
    line-height: 1.6;
    color: var(--text-tertiary);
  }

  /* ── MCP タブ ── */
  .mcp {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .conn {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border-bottom: 1px solid var(--border);
    flex: none;
  }

  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--text-tertiary);
    flex: none;
  }

  .conn[data-state='ready'] .dot {
    background: var(--accent);
  }

  .conn[data-state='unavailable'] .dot {
    background: var(--danger-fg);
  }

  .conn-text {
    font-size: var(--text-xs-size);
    color: var(--text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .conn-detail {
    margin: var(--space-1) var(--space-3) 0;
    max-height: 8em;
    overflow: auto;
    font-family: var(--font-mono);
    font-size: var(--text-xs-size);
    color: var(--text-secondary);
    white-space: pre-wrap;
    word-break: break-all;
  }

  .token {
    margin: var(--space-2) var(--space-3) 0;
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-secondary);
    font-size: var(--text-xs-size);
    cursor: pointer;
    flex: none;
  }

  .token:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  /* 最初に押すべきボタンを 1 つに絞る（もう一方は既に設定を持っている人向け）。 */
  .token.primary {
    border-color: var(--accent);
    color: var(--text-primary);
  }

  .mcp > .note {
    margin: var(--space-1) var(--space-3) 0;
    font-size: var(--text-xs-size);
    color: var(--text-tertiary);
    line-height: 1.5;
    flex: none;
  }

  .wrote {
    margin: var(--space-1) var(--space-3) 0;
    font-size: var(--text-xs-size);
    color: var(--text-secondary);
    flex: none;
  }

  .wrote.failed {
    color: var(--danger-fg);
  }

  .howto {
    margin: var(--space-2) var(--space-3) 0;
    font-size: var(--text-xs-size);
    color: var(--text-secondary);
    flex: none;
  }

  .howto summary {
    cursor: pointer;
    color: var(--text-secondary);
  }

  .howto ol {
    margin: var(--space-2) 0 0;
    padding-left: 1.4em;
    display: grid;
    gap: var(--space-1);
    line-height: 1.5;
  }

  .howto .note {
    margin: var(--space-2) 0 0;
    color: var(--text-tertiary);
    line-height: 1.5;
  }

  .logs {
    flex: 1;
    margin: 0;
    padding: var(--space-2) 0;
    list-style: none;
    overflow-y: auto;
    min-height: 0;
  }

  .log {
    display: grid;
    grid-template-columns: auto auto 1fr;
    align-items: baseline;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-3);
    font-size: var(--text-xs-size);
  }

  .time {
    color: var(--text-tertiary);
    font-variant-numeric: tabular-nums;
  }

  .tool {
    color: var(--text-primary);
  }

  .log.failed .tool {
    color: var(--danger-fg);
  }

  .path,
  .detail {
    color: var(--text-tertiary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .detail {
    grid-column: 1 / -1;
  }

  .empty {
    padding: var(--space-4) var(--space-3);
    text-align: center;
    font-size: var(--text-xs-size);
    color: var(--text-tertiary);
  }
</style>
