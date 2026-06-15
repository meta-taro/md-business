/// <reference lib="dom" />
import type { Invoice } from '@md-business/schema-invoice';
import { renderInvoiceHtml, type RenderInvoiceHtmlOptions } from './renderHtml.js';

export interface PrintInvoiceOptions extends RenderInvoiceHtmlOptions {
  /** Window object used for printing. Defaults to globalThis.window. */
  targetWindow?: Window;
  /** When true, opens a new window for print preview instead of using the current one. */
  inNewWindow?: boolean;
}

/**
 * Open the rendered invoice in a print-ready window and trigger the print dialog
 * so the user can save as PDF. Paged.js can be injected into the document by the
 * caller (e.g. Chrome extension) before this is invoked.
 */
export function printInvoice(invoice: Invoice, options: PrintInvoiceOptions = {}): void {
  const html = renderInvoiceHtml(invoice, options);
  const target = options.targetWindow ?? globalThis.window;
  if (!target) throw new Error('printInvoice requires a Window (browser environment).');

  if (options.inNewWindow) {
    const w = target.open('', '_blank');
    if (!w) throw new Error('Could not open a new window for printing.');
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
    return;
  }

  target.document.open();
  target.document.write(html);
  target.document.close();
  target.print();
}
