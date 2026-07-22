import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseTsv } from '../src/parse.js';
import { validateTsv } from '../src/validate.js';
import { serializeTsv } from '../src/serialize.js';

/**
 * 配布物（templates/test-spec/*.tsv）は、Desktop の「新規検証シート」テンプレの
 * 正本であり、OSS 配布サンプルでもある。撮影・配布中に frontmatter/型エラーで
 * 手戻りしないよう、parse → validate が必ず緑であることを CI で担保する
 * （[[feedback-oss-md-validation-required]] を TSV へ適用）。
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const templatesDir = path.resolve(here, '../../../templates/test-spec');

function loadTemplate(name: string): string {
  return readFileSync(path.resolve(templatesDir, name), 'utf8');
}

describe('templates/test-spec/standard-ja.tsv', () => {
  it('マジック行とタイトルメタを持つ', () => {
    const doc = parseTsv(loadTemplate('standard-ja.tsv'));
    expect(doc.formatId).toBe('md-business:test-spec-tsv/v1');
    expect(doc.meta['タイトル']).toBeTruthy();
  });

  it('md 版正本と同じ列構成（No. を先頭に追加）を型付きで持つ', () => {
    const doc = parseTsv(loadTemplate('standard-ja.tsv'));
    expect(doc.columns.map((c) => c.name)).toEqual([
      'No.',
      '項目',
      '手順',
      '期待結果',
      '結果',
      '実施日',
      '担当',
      '備考',
    ]);
    const byName = Object.fromEntries(doc.columns.map((c) => [c.name, c]));
    expect(byName['No.']?.type).toBe('number');
    expect(byName['手順']?.type).toBe('multiline_text');
    expect(byName['期待結果']?.type).toBe('multiline_text');
    expect(byName['結果']?.type).toBe('enum');
    expect(byName['結果']?.enumValues).toEqual(['OK', 'NG', '保留', '未実施']);
    expect(byName['実施日']?.type).toBe('date');
    expect(byName['備考']?.type).toBe('multiline_text');
  });

  it('サンプル行を含み、バリデーションは 0 件（配布物は必ず緑）', () => {
    const doc = parseTsv(loadTemplate('standard-ja.tsv'));
    expect(doc.rows.length).toBeGreaterThan(0);
    expect(validateTsv(doc)).toEqual([]);
  });

  it('正規化形で書かれており round-trip が安定（parse→serialize→parse が同一）', () => {
    const doc = parseTsv(loadTemplate('standard-ja.tsv'));
    const reparsed = parseTsv(serializeTsv(doc));
    expect(reparsed).toEqual(doc);
  });
});
