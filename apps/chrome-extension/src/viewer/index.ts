import '../shared/polyfills.js';
import { EditorState } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { EditorView, basicSetup } from 'codemirror';
import {
  loadMarkdown,
  previewMarkdown,
  type LoadMarkdownResult,
  type PreviewMarkdownResult,
} from '../shared/loadMarkdown.js';
import { STORAGE_KEY } from '../shared/storage.js';

const PDF_GUIDE_SKIP_KEY = 'mdb:pdf-guide-skip';
const PREVIEW_DEBOUNCE_MS = 200;

type Mode = 'edit' | 'preview';

interface ViewerPayload {
  source: string;
  filename?: string;
  pluginId?: string;
}

interface ViewerState {
  source: string;
  pluginId?: string;
  mode: Mode;
  editor?: EditorView;
  /** Last successful permissive render — kept so PDF DL can reuse the styles href. */
  lastStylesHref?: string;
}

const state: ViewerState = {
  source: '',
  mode: 'preview',
};

let previewTimer: ReturnType<typeof setTimeout> | null = null;

async function readPayload(): Promise<ViewerPayload | null> {
  const params = new URLSearchParams(globalThis.location.search);
  const key = params.get('key') ?? STORAGE_KEY;
  const bucket = (await chrome.storage.session.get(key)) as Record<string, ViewerPayload | undefined>;
  return bucket[key] ?? null;
}

type StatusPayload = string | { title: string; items?: string[] };
type StatusState = 'info' | 'error' | 'warning' | 'hidden';

function setStatus(message: StatusPayload, statusState: StatusState): void {
  const el = document.getElementById('mdb-status');
  if (!el) return;
  if (statusState === 'hidden') {
    el.style.display = 'none';
    el.replaceChildren();
    return;
  }
  el.dataset['state'] = statusState;
  el.style.display = '';
  el.replaceChildren();

  if (typeof message === 'string') {
    el.textContent = message;
    return;
  }

  const title = document.createElement('div');
  title.className = 'mdb-status__title';
  title.textContent = message.title;
  el.appendChild(title);

  if (message.items && message.items.length > 0) {
    const list = document.createElement('ul');
    list.className = 'mdb-status__list';
    for (const item of message.items) {
      const li = document.createElement('li');
      li.textContent = item;
      list.appendChild(li);
    }
    el.appendChild(list);
  }
}

function showWarnings(items: string[]): void {
  let el = document.getElementById('mdb-warnings');
  if (!el) {
    el = document.createElement('aside');
    el.id = 'mdb-warnings';
    el.className = 'mdb-status';
    el.dataset['state'] = 'warning';
    const stage = document.getElementById('mdb-stage');
    stage?.appendChild(el);
  }
  el.replaceChildren();
  if (items.length === 0) {
    el.style.display = 'none';
    return;
  }
  el.style.display = '';
  const title = document.createElement('div');
  title.className = 'mdb-status__title';
  title.textContent = '次の点を確認してください（描画は続行しています）';
  el.appendChild(title);
  const list = document.createElement('ul');
  list.className = 'mdb-status__list';
  for (const item of items) {
    const li = document.createElement('li');
    li.textContent = item;
    list.appendChild(li);
  }
  el.appendChild(list);
}

function updateErrorBadge(errorCount: number): void {
  const badge = document.getElementById('mdb-preview-errors-badge');
  if (!badge) return;
  if (errorCount === 0) {
    badge.setAttribute('hidden', '');
    return;
  }
  badge.removeAttribute('hidden');
  badge.textContent = `${errorCount} 件の不備`;
}

/**
 * Initialize the preview iframe with a minimal HTML document that imports the
 * fonts + schema stylesheet. The body content is replaced on each render.
 */
function bootstrapIframe(stylesHref: string): void {
  const iframe = document.getElementById('mdb-preview') as HTMLIFrameElement | null;
  if (!iframe) return;
  const doc = iframe.contentDocument;
  if (!doc) return;
  const fontsUrl = chrome.runtime.getURL('styles/fonts.css');
  const stylesUrl = chrome.runtime.getURL(stylesHref);
  const html = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<link rel="stylesheet" href="${fontsUrl}">
<link rel="stylesheet" href="${stylesUrl}" data-mdb="schema">
<style>
  /* Surrounding "paper desk" for the live preview only — Paged.js takes over
     and replaces this once printing is requested. */
  html, body { margin: 0; background: #e5e7eb; }
  body { padding: 20px; }
  .mdb-preview-host { background: white; box-shadow: 0 2px 12px rgba(0,0,0,0.15); padding: 18mm 16mm; max-width: 178mm; margin: 0 auto; }
</style>
</head>
<body>
<div class="mdb-preview-host" id="mdb-preview-host"></div>
</body>
</html>`;
  doc.open();
  doc.write(html);
  doc.close();
}

/**
 * Update the preview iframe body with the rendered HTML. Cheap — no script
 * execution, no Paged.js. Called on every debounced editor edit.
 */
function updateIframeBody(html: string): void {
  const iframe = document.getElementById('mdb-preview') as HTMLIFrameElement | null;
  const host = iframe?.contentDocument?.getElementById('mdb-preview-host');
  if (host) host.innerHTML = html;
}

function renderPreviewFromSource(): void {
  const result: PreviewMarkdownResult = previewMarkdown(
    state.source,
    state.pluginId ? { pluginId: state.pluginId } : {},
  );
  if (!result.ok) {
    setStatus({ title: result.reason, items: result.details ?? [] }, 'error');
    updateErrorBadge(0);
    return;
  }
  setStatus('', 'hidden');
  state.lastStylesHref = result.stylesHref;
  // Ensure the iframe has the right stylesheet loaded; cheap idempotent check.
  ensureIframeStylesheet(result.stylesHref);
  updateIframeBody(result.bodyHtml);
  updateErrorBadge(result.errors.length);
  showWarnings(result.warnings);
}

function ensureIframeStylesheet(href: string): void {
  const iframe = document.getElementById('mdb-preview') as HTMLIFrameElement | null;
  const doc = iframe?.contentDocument;
  if (!doc) return;
  const existing = doc.querySelector<HTMLLinkElement>('link[data-mdb="schema"]');
  const resolved = chrome.runtime.getURL(href);
  if (existing?.href === resolved) return;
  if (!doc.body) {
    bootstrapIframe(href);
    return;
  }
  if (existing) existing.remove();
  const link = doc.createElement('link');
  link.rel = 'stylesheet';
  link.href = resolved;
  link.dataset['mdb'] = 'schema';
  doc.head.appendChild(link);
}

function initEditor(source: string): void {
  const editorEl = document.getElementById('mdb-editor');
  if (!editorEl) return;
  const startState = EditorState.create({
    doc: source,
    extensions: [
      basicSetup,
      markdown(),
      EditorView.theme({
        '&': { height: '100%' },
        '.cm-scroller': { fontFamily: 'inherit' },
      }),
      EditorView.updateListener.of((update) => {
        if (!update.docChanged) return;
        state.source = update.state.doc.toString();
        scheduleRerender();
      }),
    ],
  });
  state.editor = new EditorView({ state: startState, parent: editorEl });
}

function scheduleRerender(): void {
  if (previewTimer !== null) {
    globalThis.clearTimeout(previewTimer);
  }
  previewTimer = globalThis.setTimeout(() => {
    previewTimer = null;
    renderPreviewFromSource();
  }, PREVIEW_DEBOUNCE_MS);
}

function setMode(next: Mode): void {
  state.mode = next;
  document.body.setAttribute('data-mode', next);
  for (const btn of document.querySelectorAll<HTMLButtonElement>('.mdb-toolbar__tab')) {
    btn.setAttribute('aria-selected', btn.dataset['mode'] === next ? 'true' : 'false');
  }
}

async function swapDocument(file: File): Promise<void> {
  if (!/\.(md|markdown)$/i.test(file.name) && file.type !== 'text/markdown') {
    setStatus('Markdown (.md) ファイルを選択してください。', 'error');
    return;
  }
  const source = await file.text();
  const payload: ViewerPayload = { source, filename: file.name };
  await chrome.storage.session.set({ [STORAGE_KEY]: payload });
  globalThis.location.reload();
}

/**
 * Run the strict validation path used by PDF DL. Returns a rendered
 * `LoadMarkdownResult` when valid, or an error structure for the banner.
 */
function strictValidate(): LoadMarkdownResult {
  return loadMarkdown(state.source, state.pluginId ? { pluginId: state.pluginId } : {});
}

function handlePdfDownloadClick(): void {
  const result = strictValidate();
  if (!result.ok) {
    const items = [...(result.details ?? []), ...(result.warnings ?? [])];
    setStatus({ title: result.reason, items }, 'error');
    // Bounce the user to preview mode so they can see the banner above the
    // (still-rendered) preview. Errors live in the host page DOM.
    setMode('preview');
    return;
  }
  setStatus('', 'hidden');
  // Once the user has confirmed they understand the print-dialog flow, skip
  // straight to the iframe paginate + print.
  if (readSkipFlag()) {
    void runPrintFlow(result);
    return;
  }
  pendingPrint = result;
  showPdfGuide();
}

let pendingPrint: LoadMarkdownResult & { ok: true } | null = null;

/**
 * Re-use the on-screen preview iframe for printing: rewrite it with a print
 * document, swap the parent's `document.title` (Chrome uses the TOP frame's
 * title for "Save as PDF" filename — not the iframe's), fire `print()`, and
 * restore both on `afterprint`.
 *
 * Why no Paged.js in this path: in practice, Paged.js inside an iframe that
 * is then printed via `iframe.contentWindow.print()` produced a blank Chrome
 * print dialog. The invoice template is single-page A4 and its stylesheet
 * already declares `@page size: A4 portrait` + margins, so native browser
 * pagination is sufficient and avoids the iframe + Paged.js interaction bug.
 */
async function runPrintFlow(result: LoadMarkdownResult & { ok: true }): Promise<void> {
  const iframe = document.getElementById('mdb-preview') as HTMLIFrameElement | null;
  const doc = iframe?.contentDocument;
  const win = iframe?.contentWindow;
  if (!iframe || !doc || !win) return;

  const fontsUrl = chrome.runtime.getURL('styles/fonts.css');
  const stylesUrl = chrome.runtime.getURL(result.stylesHref);
  const printHtml = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<title>${escapeHtmlText(result.pdfFileName)}</title>
<link rel="stylesheet" href="${fontsUrl}">
<link rel="stylesheet" href="${stylesUrl}">
<style>
  html, body { margin: 0; background: white; }
</style>
</head>
<body>
${result.bodyHtml}
</body>
</html>`;

  doc.open();
  doc.write(printHtml);
  doc.close();

  await waitForStylesheetsLoaded(doc);
  await new Promise<void>((resolve) => {
    win.requestAnimationFrame(() => resolve());
  });

  // Chrome's "Save as PDF" uses the TOP-LEVEL frame's document.title as the
  // default filename, even when `print()` is called on a sub-frame. Swap it
  // temporarily so the user gets the schema-derived filename, not
  // "md-business viewer.pdf".
  const previousTitle = document.title;
  document.title = result.pdfFileName;

  // Restore preview + title AFTER the dialog closes — `window.print()` is
  // async in Chrome (the dialog opens on the next tick), so a `finally`
  // restore would blank the dialog before it opens.
  const restore = (): void => {
    document.title = previousTitle;
    if (state.lastStylesHref) bootstrapIframe(state.lastStylesHref);
    renderPreviewFromSource();
  };
  win.addEventListener('afterprint', restore, { once: true });
  // Safety net: `afterprint` is reliable on desktop Chrome but we keep a
  // generous timeout in case a future build drops the event silently.
  globalThis.setTimeout(restore, 120_000);

  win.focus();
  win.print();
}

/**
 * Resolve once every `<link rel="stylesheet">` in the given document has
 * finished loading (success OR error — we proceed either way so a missing
 * stylesheet does not hang the print flow). Without this, Chrome will print
 * the document before invoice.css applies @page rules, producing a blank or
 * unstyled output.
 */
function waitForStylesheetsLoaded(doc: Document): Promise<void> {
  const links = Array.from(doc.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'));
  if (links.length === 0) return Promise.resolve();
  return Promise.all(
    links.map(
      (link) =>
        new Promise<void>((resolve) => {
          if (link.sheet) {
            resolve();
            return;
          }
          link.addEventListener('load', () => resolve(), { once: true });
          link.addEventListener('error', () => resolve(), { once: true });
          globalThis.setTimeout(resolve, 4000);
        }),
    ),
  ).then(() => undefined);
}

function escapeHtmlText(value: string): string {
  return value.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      default: return '&#39;';
    }
  });
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

  cancelBtn?.addEventListener('click', () => {
    pendingPrint = null;
    hidePdfGuide();
  });
  backdrop?.addEventListener('click', () => {
    pendingPrint = null;
    hidePdfGuide();
  });
  goBtn?.addEventListener('click', () => {
    writeSkipFlag(Boolean(skipCheckbox?.checked));
    hidePdfGuide();
    if (pendingPrint) {
      const p = pendingPrint;
      pendingPrint = null;
      void runPrintFlow(p);
    }
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

function wireHelpModal(): void {
  const modal = document.getElementById('mdb-help-modal');
  if (!modal) return;
  const open = (): void => modal.removeAttribute('hidden');
  const close = (): void => modal.setAttribute('hidden', '');

  document.getElementById('mdb-help')?.addEventListener('click', open);
  document.getElementById('mdb-help-close')?.addEventListener('click', close);
  // Both the backdrop and the explicit close button carry data-close so a
  // single delegated handler covers click-to-dismiss on either.
  modal.querySelectorAll<HTMLElement>('[data-close]').forEach((el) => {
    el.addEventListener('click', close);
  });
  document.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape' && !modal.hasAttribute('hidden')) close();
  });
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
  state.source = payload.source;
  if (payload.pluginId) state.pluginId = payload.pluginId;

  // Boot the iframe with a placeholder schema href; the real one is set on
  // first render. This avoids a flash of unstyled content.
  bootstrapIframe('styles/invoice.css');
  initEditor(payload.source);
  renderPreviewFromSource();

  setMode('preview');

  const printBtn = document.getElementById('mdb-print');
  printBtn?.addEventListener('click', handlePdfDownloadClick);

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

  for (const btn of document.querySelectorAll<HTMLButtonElement>('.mdb-toolbar__tab')) {
    btn.addEventListener('click', () => {
      const next = btn.dataset['mode'] as Mode | undefined;
      if (next === 'edit' || next === 'preview') setMode(next);
    });
  }

  wirePdfGuideModal();
  wireHelpModal();
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  setStatus(`予期しないエラー: ${message}`, 'error');
});
