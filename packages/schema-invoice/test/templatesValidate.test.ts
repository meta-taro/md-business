import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import validate from '../dist/validate.compiled.js';
import { parseInvoiceMarkdown } from '../src/parseInvoice.js';
import { translateInvoiceErrors } from '../src/translateError.js';

/**
 * 配布するテンプレートは 1 つ残らず検証を通す。
 *
 * 個別に名指しで検証していると、新しく足したテンプレートだけ検証されないまま
 * 配布され、利用者が最初に開いた瞬間にエラーになる。ディレクトリを走査して
 * 全件かけることで、テンプレートを足すだけでこのゲートに乗る。
 */

const here = dirname(fileURLToPath(import.meta.url));
const templatesDir = resolve(here, '../../../templates/invoice');
const TEMPLATES = readdirSync(templatesDir).filter((f) => f.endsWith('.md'));

describe('templates/invoice/*.md はすべて検証を通る', () => {
  for (const filename of TEMPLATES) {
    it(`${filename}`, () => {
      const raw = readFileSync(resolve(templatesDir, filename), 'utf8');
      const result = parseInvoiceMarkdown(raw, validate);
      expect(result.ok, result.ok ? '' : translateInvoiceErrors(result.errors).join(' / ')).toBe(
        true,
      );
    });
  }
});
