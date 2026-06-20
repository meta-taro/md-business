/**
 * Print-frame factory used by the viewer's PDF print flow.
 *
 * Extracted from `runPrintFlow` so that the DOM-side preparation (which is
 * trivially observable in jsdom) can be unit-tested without dragging in
 * `chrome.runtime.*`, `window.print()`, and the `afterprint` race that the
 * full flow depends on. The print dialog itself still requires a real browser
 * (Playwright) to verify.
 *
 * Bug regressed and fixed in cc20724: the old flow rewrote the on-screen
 * preview iframe with the print document and restored it on `afterprint`.
 * Cancelling the dialog raced with Chrome's preview teardown and could blank
 * the preview. The new flow appends a dedicated off-screen frame and removes
 * it on `afterprint`, so the preview iframe is never touched.
 */

export const PRINT_FRAME_ID = 'mdb-print-frame';

/**
 * Off-screen positioning (rather than `display: none`) is intentional —
 * some Chromium builds skip layout for `display: none` iframes entirely and
 * print a blank page. A 1×1 frame parked at left:-10000px keeps the frame
 * laid out and printable while invisible to the user.
 */
const PRINT_FRAME_STYLE =
  'position:fixed;left:-10000px;top:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none;';

/**
 * Create (or replace) the hidden print-only iframe attached to `doc.body`.
 * If a previous print attempt left a `#mdb-print-frame` behind (e.g. the
 * afterprint cleanup was dropped by the browser), it is removed first so we
 * never end up with two stacked print frames.
 *
 * Returns the freshly appended frame so the caller can write the print
 * document into `frame.contentDocument` and invoke `frame.contentWindow.print()`.
 */
export function createPrintFrame(doc: Document): HTMLIFrameElement {
  doc.getElementById(PRINT_FRAME_ID)?.remove();
  const frame = doc.createElement('iframe');
  frame.id = PRINT_FRAME_ID;
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = PRINT_FRAME_STYLE;
  doc.body.appendChild(frame);
  return frame;
}
