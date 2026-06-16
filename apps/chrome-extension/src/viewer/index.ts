import '../shared/polyfills.js';
import { loadMarkdown } from '../shared/loadMarkdown.js';
import { STORAGE_KEY } from '../shared/storage.js';

const PDF_GUIDE_SKIP_KEY = 'mdb:pdf-guide-skip';

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

function injectFonts(): void {
  // styles/fonts.css is emitted by scripts/post-build.mjs alongside the
  // woff2 files in vendor/fonts/. Loading it at runtime avoids Vite trying
  // to bundle a file that doesn't exist until after vite build completes.
  if (document.head.querySelector('link[data-mdb="fonts"]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = chrome.runtime.getURL('styles/fonts.css');
  link.dataset['mdb'] = 'fonts';
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
  injectFonts();
  injectStylesheet(result.stylesHref);

  const stage = document.getElementById('mdb-document');
  if (stage) stage.innerHTML = result.bodyHtml;
  setStatus('', 'hidden');

  // Paged.js paginates the document for crisp print preview.
  injectPagedJs();

  const printBtn = document.getElementById('mdb-print');
  printBtn?.addEventListener('click', handlePdfDownloadClick);

  const reloadBtn = document.getElementById('mdb-reload');
  reloadBtn?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'open-popup' }).catch(() => {
      /* ignore — popup will be opened by user clicking the action icon */
    });
  });

  wirePdfGuideModal();
}

function handlePdfDownloadClick(): void {
  // Once the user has confirmed they understand the print-dialog flow, jump
  // straight to window.print() on subsequent downloads.
  const skip = readSkipFlag();
  if (skip) {
    triggerPrint();
    return;
  }
  showPdfGuide();
}

function readSkipFlag(): boolean {
  try {
    return globalThis.localStorage?.getItem(PDF_GUIDE_SKIP_KEY) === '1';
  } catch {
    return false;
  }
}

function writeSkipFlag(value: boolean): void {
  try {
    if (value) globalThis.localStorage?.setItem(PDF_GUIDE_SKIP_KEY, '1');
    else globalThis.localStorage?.removeItem(PDF_GUIDE_SKIP_KEY);
  } catch {
    /* localStorage disabled — silently fall back to per-click prompting */
  }
}

function wirePdfGuideModal(): void {
  const modal = document.getElementById('mdb-pdf-guide');
  const backdrop = modal?.querySelector('.mdb-modal__backdrop');
  const cancelBtn = document.getElementById('mdb-pdf-guide-cancel');
  const goBtn = document.getElementById('mdb-pdf-guide-go');
  const skipCheckbox = document.getElementById('mdb-pdf-guide-skip') as HTMLInputElement | null;

  cancelBtn?.addEventListener('click', hidePdfGuide);
  backdrop?.addEventListener('click', hidePdfGuide);
  goBtn?.addEventListener('click', () => {
    writeSkipFlag(Boolean(skipCheckbox?.checked));
    hidePdfGuide();
    triggerPrint();
  });
}

function showPdfGuide(): void {
  const modal = document.getElementById('mdb-pdf-guide');
  if (!modal) return;
  const skipCheckbox = document.getElementById('mdb-pdf-guide-skip') as HTMLInputElement | null;
  if (skipCheckbox) skipCheckbox.checked = false;
  modal.removeAttribute('hidden');
}

function hidePdfGuide(): void {
  document.getElementById('mdb-pdf-guide')?.setAttribute('hidden', '');
}

function triggerPrint(): void {
  // Defer one frame so the modal is fully torn down before the (modal) print
  // dialog opens — otherwise some browsers leave the backdrop visible in the
  // printed output preview.
  globalThis.requestAnimationFrame(() => globalThis.print());
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  setStatus(`予期しないエラー: ${message}`, 'error');
});
