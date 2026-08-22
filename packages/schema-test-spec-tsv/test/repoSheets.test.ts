import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseTsv } from '../src/parse.js';
import { validateTsv } from '../src/validate.js';

/**
 * このリポジトリ自身の検証シート（docs/test-specs/*.tsv）を全件かける。
 *
 * シートは人が開いて合否を書き込む器なので、壊れていると開いた人が最初に触った瞬間に
 * 詰まる。とくに「セルの中で改行して 1 レコードが 2 物理行へ割れる」書き方は、
 * テキストで見ている限り正しく見えるのに、表として開くと別の行に化ける。
 * 書いた側では気づけないため、ディレクトリを走査して機械で止める。
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const sheetsDir = path.resolve(here, '../../../docs/test-specs');
const SHEETS = readdirSync(sheetsDir).filter((f) => f.endsWith('.tsv'));

describe('docs/test-specs/*.tsv はすべて検証を通る', () => {
  it('シートが 1 枚以上ある（走査先を間違えたら気づけるように）', () => {
    expect(SHEETS.length).toBeGreaterThan(0);
  });

  for (const filename of SHEETS) {
    it(`${filename}`, () => {
      const doc = parseTsv(readFileSync(path.resolve(sheetsDir, filename), 'utf8'));
      expect(doc.formatId).toBe('md-business:test-spec-tsv/v1');

      const issues = validateTsv(doc);
      const detail = issues
        .map((i) => `${i.row + 2} 行目 ${i.columnName}: ${i.message}`)
        .join(' / ');
      expect(issues, detail).toEqual([]);
    });
  }
});
