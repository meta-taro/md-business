<script lang="ts">
  // ファイル情報ダイアログ。右クリック →「ファイル情報」で開く。
  // 値は 3 つのコマンドに分けて取る。容量・更新日時（file_stat）と Git 管理状態
  // （git_file_state）はすぐ返るので先に埋め、ファイル全体を読む file_digest だけ
  // 「測定中…」のまま後から埋める。大きいファイルで枠ごと待たせないための分割。
  import { invoke } from '@tauri-apps/api/core';
  import { t } from '$lib/i18n/i18n.svelte';
  import { i18n } from '$lib/i18n/i18n.svelte';
  import {
    formatSize,
    formatByteCount,
    formatModified,
    ENCODING_LABEL_KEYS,
    LINE_ENDING_LABEL_KEYS,
    GIT_STATE_LABEL_KEYS,
    type FileStat,
    type FileDigest,
    type GitState,
  } from './fileInfo';

  let {
    root,
    relPath,
    onclose,
  }: {
    root: string;
    /** 対象ファイルの相対パス（走査と同じ "/" 区切り）。 */
    relPath: string;
    onclose: () => void;
  } = $props();

  // null = まだ返っていない（測定中）、'failed' = 取れなかった。
  let stat = $state<FileStat | 'failed' | null>(null);
  let gitState = $state<GitState | null>(null);
  let digest = $state<FileDigest | 'failed' | null>(null);
  let copied = $state(false);

  // 対象が変わるたびに測り直す。前の対象の結果が遅れて返っても捨てる（alive）ので、
  // 別ファイルの値が混ざった表示にはならない。
  $effect(() => {
    const r = root;
    const p = relPath;
    stat = null;
    gitState = null;
    digest = null;
    copied = false;
    let alive = true;
    void invoke<FileStat>('file_stat', { root: r, relPath: p })
      .then((v) => alive && (stat = v))
      .catch(() => alive && (stat = 'failed'));
    void invoke<GitState>('git_file_state', { root: r, relPath: p })
      .then((v) => alive && (gitState = v))
      // Git 無し・非リポジトリは Rust 側が notRepo を返す。ここに来るのは想定外の失敗。
      .catch(() => alive && (gitState = 'notRepo'));
    void invoke<FileDigest>('file_digest', { root: r, relPath: p })
      .then((v) => alive && (digest = v))
      .catch(() => alive && (digest = 'failed'));
    return () => {
      alive = false;
    };
  });

  const sizeText = $derived(
    stat === null
      ? t('fileInfo.measuring')
      : stat === 'failed'
        ? t('fileInfo.failed')
        : `${formatSize(stat.size)}（${formatByteCount(stat.size)} B）`,
  );

  const modifiedText = $derived(
    stat === null
      ? t('fileInfo.measuring')
      : stat === 'failed'
        ? t('fileInfo.failed')
        : (formatModified(stat.modifiedMs, i18n.locale) ?? t('fileInfo.unknown')),
  );

  const gitText = $derived(gitState === null ? t('fileInfo.measuring') : t(GIT_STATE_LABEL_KEYS[gitState]));

  const linesText = $derived(
    digest === null
      ? t('fileInfo.measuring')
      : digest === 'failed'
        ? t('fileInfo.failed')
        : // UTF-8 として読めないファイルは数えていない（推測した数を出さない）。
          (digest.lineCount?.toLocaleString('en-US') ?? t('fileInfo.unknown')),
  );

  const encodingText = $derived(
    digest === null
      ? t('fileInfo.measuring')
      : digest === 'failed'
        ? t('fileInfo.failed')
        : t(ENCODING_LABEL_KEYS[digest.encoding]),
  );

  const lineEndingText = $derived(
    digest === null
      ? t('fileInfo.measuring')
      : digest === 'failed'
        ? t('fileInfo.failed')
        : digest.lineEnding === null
          ? t('fileInfo.unknown')
          : t(LINE_ENDING_LABEL_KEYS[digest.lineEnding]),
  );

  const sha256Text = $derived(
    digest === null
      ? t('fileInfo.measuring')
      : digest === 'failed'
        ? t('fileInfo.failed')
        : digest.sha256,
  );

  async function copySha(): Promise<void> {
    if (digest === null || digest === 'failed') return;
    await navigator.clipboard.writeText(digest.sha256).catch(() => undefined);
    copied = true;
  }

  function onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault();
      onclose();
    }
  }
</script>

<button class="backdrop" type="button" aria-label={t('common.close')} onclick={onclose}></button>

<div
  class="dialog"
  role="dialog"
  aria-modal="true"
  aria-label={t('fileInfo.title')}
  tabindex="-1"
  onkeydown={onKeydown}
>
  <h2 class="title">{t('fileInfo.title')}</h2>

  <dl class="rows">
    <dt>{t('fileInfo.path')}</dt>
    <dd class="path">{relPath}</dd>

    <dt>{t('fileInfo.size')}</dt>
    <dd>{sizeText}</dd>

    <dt>{t('fileInfo.modified')}</dt>
    <dd>{modifiedText}</dd>

    <dt>{t('fileInfo.git')}</dt>
    <dd>{gitText}</dd>

    <dt>{t('fileInfo.lines')}</dt>
    <dd>{linesText}</dd>

    <dt>{t('fileInfo.encoding')}</dt>
    <dd>{encodingText}</dd>

    <dt>{t('fileInfo.lineEnding')}</dt>
    <dd>{lineEndingText}</dd>

    <dt>{t('fileInfo.sha256')}</dt>
    <dd class="sha">
      <code class="sha-value">{sha256Text}</code>
      <!-- 64 桁を目で写すのは無理なので、控えるときはコピーで取る。 -->
      <button
        class="copy"
        type="button"
        onclick={copySha}
        disabled={digest === null || digest === 'failed'}
      >
        {copied ? t('fileInfo.copied') : t('fileInfo.copy')}
      </button>
    </dd>
  </dl>

  <div class="actions">
    <button class="btn" type="button" onclick={onclose}>{t('common.close')}</button>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 100;
    border: none;
    background: rgb(0 0 0 / 0.35);
    cursor: default;
  }

  .dialog {
    position: fixed;
    z-index: 101;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: min(520px, calc(100vw - 2 * var(--space-4)));
    max-height: calc(100vh - 2 * var(--space-4));
    overflow-y: auto;
    padding: var(--space-4);
    background: var(--bg-elevated);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg, 0 12px 32px rgba(0, 0, 0, 0.4));
  }

  .title {
    margin: 0 0 var(--space-3);
    font-size: var(--text-base-size, 14px);
    font-weight: 700;
    color: var(--text-primary);
  }

  .rows {
    display: grid;
    /* 見出し列は内容に合わせつつ広がりすぎないよう上限を置く。 */
    grid-template-columns: minmax(auto, 8em) 1fr;
    gap: var(--space-2) var(--space-3);
    margin: 0 0 var(--space-4);
    font-size: var(--text-sm-size);
  }

  .rows dt {
    color: var(--text-tertiary);
    font-size: var(--text-xs-size);
    /* 値が折り返しても見出しは 1 行目に揃える。 */
    align-self: start;
  }

  .rows dd {
    margin: 0;
    color: var(--text-primary);
    min-width: 0;
    word-break: break-word;
  }

  .path {
    color: var(--text-secondary);
    word-break: break-all;
  }

  .sha {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .sha-value {
    font-family: var(--font-mono, monospace);
    font-size: var(--text-xs-size);
    word-break: break-all;
    min-width: 0;
  }

  .copy {
    flex: none;
    height: 22px;
    padding: 0 var(--space-2);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-secondary);
    font-family: inherit;
    font-size: var(--text-2xs-size, 10px);
    cursor: pointer;
  }

  .copy:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
  }

  .btn {
    height: 28px;
    padding: 0 var(--space-3);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-primary);
    font-family: inherit;
    font-size: var(--text-sm-size);
    cursor: pointer;
  }
</style>
