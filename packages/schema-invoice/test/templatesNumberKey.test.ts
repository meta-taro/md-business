import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { INVOICE_DOCUMENT_LABELS, isInvoiceDocumentType } from '../src/documentType.js';

/**
 * ひな形の番号キーは、その文書の種別の言い方で書く。
 *
 * 見積書に `請求書番号:` と書いてあると、コピーして使う人はそのまま書き続ける。
 * 辞書はどの言い方も受け取るので検証では落ちず、不自然な表記だけが配布物から
 * 広がる。ひな形の側で正しい言い方を示すことでしか止まらない。
 */

const here = dirname(fileURLToPath(import.meta.url));
const templatesDir = resolve(here, '../../../templates/invoice');
const TEMPLATES = readdirSync(templatesDir).filter((f) => f.endsWith('.md'));

/** frontmatter のトップレベルキー（行頭・インデントなし）だけを見る。 */
function hasRootKey(source: string, key: string): boolean {
  return new RegExp(`^${key}:`, 'm').test(source);
}

function documentTypeOf(source: string): string {
  const matched = /^種別:\s*(\S+)/m.exec(source);
  return matched?.[1] ?? '請求書';
}

describe('templates/invoice/*.md の番号キーは種別に合わせる', () => {
  for (const filename of TEMPLATES) {
    it(`${filename}`, () => {
      const raw = readFileSync(resolve(templatesDir, filename), 'utf8');
      const type = documentTypeOf(raw);
      expect(isInvoiceDocumentType(type)).toBe(true);
      if (!isInvoiceDocumentType(type)) return;

      // 英語キーのひな形は種別に紐付かない言い方なので、そのままで良い。
      if (hasRootKey(raw, 'invoiceNumber')) return;

      const labels = INVOICE_DOCUMENT_LABELS[type];
      // 番号と宛先は、種別によって刷られる見出しが変わる。ひな形のキーもそれに合わせる。
      for (const pick of [
        (l: (typeof labels)) => l.numberLabel,
        (l: (typeof labels)) => l.recipientLabel,
      ]) {
        const expected = pick(labels);
        expect(hasRootKey(raw, expected)).toBe(true);

        // 種別に合わない言い方が残っていないこと（辞書は通すので、ここで見るしかない）。
        for (const other of Object.values(INVOICE_DOCUMENT_LABELS)) {
          if (pick(other) === expected) continue;
          expect(hasRootKey(raw, pick(other))).toBe(false);
        }
      }
    });
  }
});
