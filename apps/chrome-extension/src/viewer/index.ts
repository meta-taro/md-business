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
  // Paged.js scoops the ENTIRE <body> into a `<template data-ref="pagedjs-content">`
  // and re-renders it inside `<div class="pagedjs_pages">`. That removes our
  // toolbar and modal from the live DOM. Detach them first, then re-attach
  // them as siblings of `.pagedjs_pages` once pagination has rendered.
  const toolbar = document.getElementById('mdb-toolbar');
  const modal = document.getElementById('mdb-pdf-guide');
  toolbar?.remove();
  modal?.remove();

  const reattach = (): void => {
    if (toolbar && !toolbar.isConnected) document.body.appendChild(toolbar);
    if (modal && !modal.isConnected) document.body.appendChild(modal);
  };

  if (toolbar || modal) {
    const observer = new MutationObserver(() => {
      if (document.querySelector('.pagedjs_pages')) {
        reattach();
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    // Safety net: if Paged.js fails to load or never renders, still restore
    // the UI within a few seconds so the user is not left stranded.
    globalThis.setTimeout(reattach, 4000);
  }

  // Paged.js is vendored locally to satisfy MV3 CSP.
  const url = chrome.runtime.getURL('vendor/paged.polyfill.js');
  const script = document.createElement('script');
  script.src = url;
  script.async = false;
  document.body.appendChild(script);
}

function markStaticStylesheetsAsPagedIgnore(): void {
  // Vite rewrites the `<link rel="stylesheet" href="./viewer.css">` we author
  // in index.html into a bundled href and strips any extra attributes we put
  // on the tag — so we cannot annotate it at author time. Tag it from JS
  // before Paged.js mounts so that Paged.js skips it during CSS parsing.
  // (Without this Paged.js treats `@media print` rules as canonical and the
  // toolbar's `display: none` leaks onto the screen.) Stylesheets we inject
  // ourselves carry a `data-mdb` marker and are left untouched.
  for (const el of document.head.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')) {
    if (!el.dataset['mdb']) el.setAttribute('data-pagedjs-ignore', '');
  }
}

async function main(): Promise<void> {
  markStaticStylesheetsAsPagedIgnore();
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
  // Stash on globalThis so `triggerPrint` can swap `document.title` to the
  // PDF filename right before `window.print()` opens — Chrome reads the
  // current `document.title` as the suggested "Save as PDF" filename.
  (globalThis as unknown as { __mdbPdfFileName?: string }).__mdbPdfFileName = result.pdfFileName;
  (globalThis as unknown as { __mdbViewerTitle?: string }).__mdbViewerTitle = result.documentTitle;
  injectFonts();
  injectStylesheet(result.stylesHref);

  const stage = document.getElementById('mdb-document');
  if (stage) stage.innerHTML = result.bodyHtml;
  setStatus('', 'hidden');

  // Wire toolbar + modal handlers BEFORE Paged.js, because injectPagedJs
  // detaches those nodes from <body> mid-flight. DOM event listeners survive
  // the detach -> re-append cycle, but getElementById would not find them
  // during the detached window.
  const printBtn = document.getElementById('mdb-print');
  printBtn?.addEventListener('click', handlePdfDownloadClick);

  // "別ファイルを開く" opens a hidden <input type="file"> so the user can swap
  // the rendered document in-place. We deliberately do NOT message a service
  // worker — MV3's `chrome.action.openPopup()` requires a user gesture and is
  // brittle across platforms; an inline file picker is the reliable path.
  const reloadBtn = document.getElementById('mdb-reload');
  const filePicker = document.getElementById('mdb-file-picker') as HTMLInputElement | null;
  reloadBtn?.addEventListener('click', () => filePicker?.click());
  filePicker?.addEventListener('change', () => {
    const file = filePicker.files?.[0];
    if (!file) return;
    void swapDocument(file).finally(() => {
      filePicker.value = '';
    });
  });

  wirePdfGuideModal();

  // Paged.js paginates the document for crisp print preview.
  injectPagedJs();
}

async function swapDocument(file: File): Promise<void> {
  if (!/\.(md|markdown)$/i.test(file.name) && file.type !== 'text/markdown') {
    setStatus('Markdown (.md) ファイルを選択してください。', 'error');
    return;
  }
  const source = await file.text();
  const payload: ViewerPayload = { source, filename: file.name };
  // Persist so a manual refresh re-renders the new doc rather than the old one.
  await chrome.storage.session.set({ [STORAGE_KEY]: payload });
  // Easiest way to fully reset Paged.js state is a full reload — the existing
  // bootstrap path (storage → loadMarkdown → Paged.js) then runs cleanly.
  globalThis.location.reload();
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
  globalThis.requestAnimationFrame(() => {
    // Chrome's "Save as PDF" reads `document.title` at the moment print()
    // runs to populate the suggested filename. Swap to the PDF name, print,
    // restore the tab title afterwards. window.print() blocks the main
    // thread until the dialog closes, so a straight-line save/restore is
    // sufficient — no afterprint listener needed.
    const stash = globalThis as unknown as { __mdbPdfFileName?: string; __mdbViewerTitle?: string };
    const pdfName = stash.__mdbPdfFileName;
    const tabTitle = stash.__mdbViewerTitle ?? document.title;
    if (pdfName) document.title = pdfName;
    try {
      globalThis.print();
    } finally {
      document.title = tabTitle;
    }
  });
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  setStatus(`予期しないエラー: ${message}`, 'error');
});
