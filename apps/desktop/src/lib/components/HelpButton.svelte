<script lang="ts">
  import { onMount } from 'svelte';
  import { getVersion } from '@tauri-apps/api/app';
  import { openUrl } from '@tauri-apps/plugin-opener';
  import { updater } from '$lib/update/updater.svelte';

  // ヘルプ [?] ボタン + ポップオーバー。アプリ名／バージョン／操作マニュアル／
  // キーボードショートカット／ライセンス・リポジトリを 1 枚にまとめる。
  //
  // バージョンは tauri.conf.json の version を getVersion() で読む（ビルド時に焼き込まれる）。
  // Tauri ランタイム外（素の vite）では getVersion が例外を投げるため握りつぶし、null 表示にする。
  const REPO_URL = 'https://github.com/meta-taro/md-business';
  const MANUAL_JA_URL = 'https://meta-taro.github.io/md-business/manual/ja/';
  const MANUAL_EN_URL = 'https://meta-taro.github.io/md-business/manual/';

  let open = $state(false);
  let version = $state<string | null>(null);

  onMount(async () => {
    try {
      version = await getVersion();
    } catch {
      version = null; // Tauri 外。バージョン非表示にフォールバック。
    }
  });

  function toggle(): void {
    open = !open;
  }

  function close(): void {
    open = false;
  }

  // 「更新を確認」。ポップオーバーを閉じ、更新モーダル（UpdateDialog）へ引き継ぐ。
  function checkForUpdate(): void {
    close();
    void updater.check();
  }

  // 外部リンクを既定ブラウザで開く。opener プラグイン経由（webview 内遷移を避ける）。
  // Tauri 外（素の vite プレビュー）では例外になるため握りつぶす。
  async function openExternal(url: string): Promise<void> {
    try {
      await openUrl(url);
    } catch {
      // ランタイム外。何もしない。
    }
  }

  function onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape' && open) close();
  }

  // 保存 / PDF は matchShortcut（shortcuts.ts）と一致させる。Ctrl（Win/Linux）/ ⌘（Mac）両表記。
  const shortcuts: { keys: string; label: string }[] = [
    { keys: 'Ctrl / ⌘ + S', label: '保存' },
    { keys: 'Ctrl / ⌘ + P', label: 'PDF 出力' },
  ];
</script>

<svelte:window onkeydown={onKeydown} />

<div class="help-wrap">
  <button
    class="btn ghost with-icon"
    class:active={open}
    type="button"
    onclick={toggle}
    title="ヘルプ・バージョン情報"
    aria-label="ヘルプ・バージョン情報"
    aria-haspopup="dialog"
    aria-expanded={open}
  >
    <svg class="btn-ico" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="6.4" fill="none" stroke="currentColor" stroke-width="1.2" />
      <path
        d="M6.1 6.1a1.9 1.9 0 1 1 2.6 1.76c-.5.22-.8.6-.8 1.14v.3"
        fill="none"
        stroke="currentColor"
        stroke-width="1.2"
        stroke-linecap="round"
      />
      <circle cx="8" cy="11.6" r="0.75" fill="currentColor" />
    </svg>
    <span>ヘルプ</span>
  </button>

  {#if open}
    <!-- 外側クリックで閉じる不可視バックドロップ。 -->
    <button class="backdrop" type="button" aria-label="閉じる" onclick={close}></button>
    <div class="panel" role="dialog" aria-label="ヘルプ・バージョン情報">
      <div class="ident">
        <span class="brand-dot" aria-hidden="true"></span>
        <div class="ident-text">
          <span class="app-name">md-business</span>
          <span class="app-sub">
            デスクトップ版{#if version}<span class="ver">v{version}</span>{/if}
          </span>
        </div>
      </div>

      <div class="sep"></div>

      <section class="block">
        <button class="update-btn" type="button" onclick={checkForUpdate}>
          <svg class="update-ico" viewBox="0 0 16 16" aria-hidden="true">
            <path
              d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9"
              fill="none"
              stroke="currentColor"
              stroke-width="1.2"
              stroke-linecap="round"
            />
            <path
              d="M13.5 2.5V5H11"
              fill="none"
              stroke="currentColor"
              stroke-width="1.2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          <span>更新を確認</span>
        </button>
      </section>

      <div class="sep"></div>

      <section class="block">
        <h3 class="block-title">操作マニュアル</h3>
        <ul class="link-list">
          <li>
            <button class="link-btn" type="button" onclick={() => openExternal(MANUAL_JA_URL)}>
              <span>操作マニュアル（日本語）</span>
              <svg class="link-ico" viewBox="0 0 16 16" aria-hidden="true">
                <path
                  d="M6 3h7v7M13 3 6.5 9.5M11 9v4H3V5h4"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </button>
          </li>
          <li>
            <button class="link-btn" type="button" onclick={() => openExternal(MANUAL_EN_URL)}>
              <span>User guide (English)</span>
              <svg class="link-ico" viewBox="0 0 16 16" aria-hidden="true">
                <path
                  d="M6 3h7v7M13 3 6.5 9.5M11 9v4H3V5h4"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </button>
          </li>
        </ul>
      </section>

      <div class="sep"></div>

      <section class="block">
        <h3 class="block-title">キーボードショートカット</h3>
        <ul class="sc-list">
          {#each shortcuts as sc (sc.label)}
            <li class="sc-row">
              <span class="sc-label">{sc.label}</span>
              <kbd class="sc-keys">{sc.keys}</kbd>
            </li>
          {/each}
        </ul>
      </section>

      <div class="sep"></div>

      <section class="block about">
        <div class="about-row"><span class="about-key">ライセンス</span><span>MIT</span></div>
        <div class="about-row">
          <span class="about-key">リポジトリ</span>
          <button
            class="repo-url"
            type="button"
            title="ブラウザで開く"
            onclick={() => openExternal(REPO_URL)}
          >
            {REPO_URL}
          </button>
        </div>
      </section>
    </div>
  {/if}
</div>

<style>
  .help-wrap {
    position: relative;
    display: inline-flex;
  }

  /* TopBar の .btn.ghost.with-icon と同じ「アイコン + ラベル」体裁に揃える
     （この単体でも成立するよう再定義）。保存 / PDF / テーマ と統一。 */
  .btn {
    height: 28px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-1);
    padding: 0 var(--space-3);
    border: none;
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--text-secondary);
    font-size: var(--text-sm-size);
    cursor: pointer;
    transition:
      background var(--dur-fast) var(--ease),
      color var(--dur-fast) var(--ease);
  }

  .btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  /* ポップオーバーを開いている間はアクティブ表示（押下状態が分かる）。 */
  .btn.active {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .btn:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px var(--accent-subtle);
    color: var(--text-primary);
  }

  .btn-ico {
    width: 15px;
    height: 15px;
    flex: none;
  }

  /* ポップオーバー外側クリックを拾う不可視レイヤ。 */
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 40;
    border: none;
    background: transparent;
    cursor: default;
  }

  /* TopBar は最上部なので下向きに開く。右端ボタン起点で右寄せ。 */
  .panel {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    z-index: 41;
    width: 300px;
    padding: var(--space-3);
    background: var(--bg-elevated);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg, 0 12px 32px rgba(0, 0, 0, 0.4));
    cursor: default;
  }

  .ident {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .brand-dot {
    width: 12px;
    height: 12px;
    border-radius: var(--radius-full);
    background: var(--accent-gradient);
    flex: none;
  }

  .ident-text {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .app-name {
    font-size: var(--text-sm-size);
    font-weight: 700;
    color: var(--text-primary);
  }

  .app-sub {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-xs-size);
    color: var(--text-tertiary);
  }

  .ver {
    padding: 1px 6px;
    border-radius: var(--radius-full);
    background: var(--accent-subtle);
    color: var(--accent);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .sep {
    height: 1px;
    margin: var(--space-3) 0;
    background: var(--border);
  }

  .block-title {
    margin: 0 0 var(--space-2);
    font-size: var(--text-xs-size);
    font-weight: 600;
    color: var(--text-secondary);
  }

  /* 「更新を確認」。パネル幅いっぱいの行アクション。押すとポップオーバーを閉じ、
     更新モーダルへ引き継ぐ。 */
  .update-btn {
    width: 100%;
    height: 32px;
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    padding: 0 var(--space-3);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-md);
    background: var(--bg-subtle);
    color: var(--text-primary);
    font-size: var(--text-sm-size);
    font-weight: 600;
    cursor: pointer;
    transition:
      background var(--dur-fast, 120ms) ease,
      border-color var(--dur-fast, 120ms) ease,
      color var(--dur-fast, 120ms) ease;
  }

  .update-btn:hover {
    background: var(--bg-hover);
    border-color: var(--accent);
    color: var(--accent);
  }

  .update-btn:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px var(--accent-subtle);
  }

  .update-ico {
    width: 15px;
    height: 15px;
    flex: none;
  }

  .sc-list {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .sc-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
  }

  .sc-label {
    font-size: var(--text-sm-size);
    color: var(--text-primary);
  }

  .sc-keys {
    padding: 2px 8px;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    background: var(--bg-subtle);
    color: var(--text-secondary);
    font-family: var(--font-mono);
    font-size: var(--text-2xs-size, 10px);
    white-space: nowrap;
  }

  .about {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .about-row {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    font-size: var(--text-xs-size);
    color: var(--text-secondary);
  }

  .about-key {
    flex: none;
    width: 68px;
    color: var(--text-tertiary);
  }

  /* リポジトリ URL。テキストのように見えるが opener でブラウザ起動するボタン。 */
  .repo-url {
    padding: 0;
    border: none;
    background: transparent;
    text-align: left;
    word-break: break-all;
    color: var(--accent);
    font-family: inherit;
    font-size: inherit;
    cursor: pointer;
  }

  .repo-url:hover {
    text-decoration: underline;
  }

  .repo-url:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px var(--accent-subtle);
    border-radius: var(--radius-sm);
  }

  /* 操作マニュアルへの外部リンク（opener でブラウザ起動）。行全体がクリック領域。 */
  .link-list {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .link-btn {
    width: 100%;
    display: inline-flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-2);
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-primary);
    font-family: inherit;
    font-size: var(--text-sm-size);
    text-align: left;
    cursor: pointer;
    transition: background var(--dur-fast, 120ms) ease;
  }

  .link-btn:hover {
    background: var(--bg-hover);
    color: var(--accent);
  }

  .link-btn:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px var(--accent-subtle);
  }

  .link-ico {
    width: 13px;
    height: 13px;
    flex: none;
    color: var(--text-tertiary);
  }

  .link-btn:hover .link-ico {
    color: var(--accent);
  }
</style>
