/**
 * file:// content script.
 *
 * When the user opens a .md file in Chrome (with "Allow access to file URLs"
 * enabled in chrome://extensions), this script picks up the rendered <pre>
 * tree Chrome inserts and forwards the raw source to the viewer page.
 *
 * MVP simplification: we read the same source from `document.body.innerText`
 * (Chrome renders plain text files into a single <pre>) and bounce the user
 * to the extension's viewer/index.html.
 *
 * This way the contractor's flow is just: double-click .md → instant invoice.
 */
import { STORAGE_KEY, type ViewerPayload } from '../shared/storage.js';

function isLikelyMarkdown(text: string): boolean {
  // We rely on the file:// match pattern (already filters .md / .markdown),
  // so this is a defensive sanity check: bail out for tiny / binary bodies.
  if (!text || text.length < 4) return false;
  if (/�/.test(text)) return false;
  return true;
}

async function main(): Promise<void> {
  if (globalThis.location?.protocol !== 'file:') return;
  const text = document.body?.innerText ?? '';
  if (!isLikelyMarkdown(text)) return;

  const filename = decodeURIComponent(globalThis.location.pathname.split('/').pop() ?? 'document.md');
  const payload: ViewerPayload = { source: text, filename };

  // chrome.storage is available to content scripts because the extension
  // declared the "storage" permission. session is per-browser-session.
  await chrome.storage.session.set({ [STORAGE_KEY]: payload });

  const viewerUrl = chrome.runtime.getURL('src/viewer/index.html');
  // Replace the file:// tab with the viewer; the user's tab history still
  // contains the file URL so they can navigate back if needed.
  globalThis.location.replace(viewerUrl);
}

main().catch(() => {
  /* No console.log in production; failures fall back to the popup-driven flow. */
});
