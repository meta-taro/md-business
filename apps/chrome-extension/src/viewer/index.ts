import { loadMarkdown } from '../shared/loadMarkdown.js';
import { STORAGE_KEY } from '../shared/storage.js';

interface ViewerPayload {
  source: string;
  filename?: string;
  pluginId?: string;
}

async function readPayload(): Promise<ViewerPayload | null> {
  const params = new URLSearchParams(globalThis.location.search);
  const key = params.get('key') ?? STORAGE_KEY;
  const bucket = (await chrome.storage.session.get(key)) as Record<string, ViewerPayload | undefined>;
  return bucket[key] ?? null;
}

function setStatus(message: string, state: 'info' | 'error' | 'hidden'): void {
  const el = document.getElementById('mdb-status');
  if (!el) return;
  if (state === 'hidden') {
    el.style.display = 'none';
    return;
  }
  el.textContent = message;
  el.dataset['state'] = state;
  el.style.display = '';
}

function injectStylesheet(href: string): void {
  // Resolve relative to the extension's dist/ root, not the viewer dir.
  const resolved = chrome.runtime.getURL(href);
  const existing = document.head.querySelector(`link[data-mdb="schema"]`);
  if (existing) existing.remove();
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = resolved;
  link.dataset['mdb'] = 'schema';
  document.head.appendChild(link);
}

function injectPagedJs(): void {
  // Paged.js is vendored locally to satisfy MV3 CSP.
  const url = chrome.runtime.getURL('vendor/paged.polyfill.js');
  const script = document.createElement('script');
  script.src = url;
  script.async = false;
  document.body.appendChild(script);
}

async function main(): Promise<void> {
  const payload = await readPayload();
  if (!payload) {
    setStatus(
      'ドキュメントが見つかりません。ポップアップから .md ファイルを開き直してください。',
      'error',
    );
    return;
  }

  const result = loadMarkdown(payload.source, payload.pluginId ? { pluginId: payload.pluginId } : {});
  if (!result.ok) {
    const details = result.details?.join('\n') ?? '';
    setStatus(`${result.reason}\n${details}`, 'error');
    return;
  }

  document.title = result.documentTitle;
  injectStylesheet(result.stylesHref);

  const stage = document.getElementById('mdb-document');
  if (stage) stage.innerHTML = result.bodyHtml;
  setStatus('', 'hidden');

  // Paged.js paginates the document for crisp print preview.
  injectPagedJs();

  const printBtn = document.getElementById('mdb-print');
  printBtn?.addEventListener('click', () => globalThis.print());

  const reloadBtn = document.getElementById('mdb-reload');
  reloadBtn?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'open-popup' }).catch(() => {
      /* ignore — popup will be opened by user clicking the action icon */
    });
  });
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  setStatus(`予期しないエラー: ${message}`, 'error');
});
