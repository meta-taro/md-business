import { describe, it, expect } from 'vitest';
import { isTestSpecTsv, isOpenableFileName } from '../src/shared/tsv.js';
import { loadMarkdown, previewMarkdown } from '../src/shared/loadMarkdown.js';

const SHEET = [
  '#! md-business:test-spec-tsv/v1',
  '# タイトル: ログイン検証',
  '# 文書番号: TEST-001',
  '#@ rowid _id',
  '#@ hidden r000000000003',
  '#@ note 結果は人が付ける',
  '#@ style 結果 OK=#e7f6ec NG=#fcebec 保留=#fdf3e2',
  'No.:number\t手順:multiline\t結果:enum(OK|NG|保留|未実施)\t_id',
  '1\t開く\\n押す\tOK\tr000000000001',
  '2\t<script>alert(1)</script>\tNG\tr000000000002',
  '3\t控えの行\t保留\tr000000000003',
  '4\t待つ\t保留\tr000000000004',
].join('\n');

describe('isTestSpecTsv', () => {
  it('1 行目の印で見分ける（BOM・CRLF があっても）', () => {
    expect(isTestSpecTsv(SHEET)).toBe(true);
    expect(isTestSpecTsv(`﻿${SHEET.replace(/\n/g, '\r\n')}`)).toBe(true);
    expect(isTestSpecTsv('---\nschema: spec/v1\n---\n')).toBe(false);
    expect(isTestSpecTsv('a\tb\n1\t2')).toBe(false);
  });
});

describe('isOpenableFileName', () => {
  it('.md / .markdown / .tsv を受ける', () => {
    expect(isOpenableFileName('a.md')).toBe(true);
    expect(isOpenableFileName('a.MARKDOWN')).toBe(true);
    expect(isOpenableFileName('001-login.tsv')).toBe(true);
    expect(isOpenableFileName('a.csv')).toBe(false);
  });
});

describe('検証シート（TSV）の表示', () => {
  const html = (): string => {
    const result = previewMarkdown(SHEET);
    if (!result.ok) throw new Error(result.reason);
    expect(result.pluginId).toBe('test-spec-tsv');
    expect(result.stylesHref).toBe('styles/test-spec-tsv.css');
    expect(result.errors).toEqual([]);
    return result.bodyHtml;
  };

  it('行 ID の列と控えの行は出さない', () => {
    const body = html();
    expect(body).not.toContain('_id');
    expect(body).not.toContain('r000000000001');
    expect(body).not.toContain('控えの行');
    expect(body).toContain('待つ');
  });

  it('結果の値で行に色を敷く', () => {
    const body = html();
    expect(body).toContain('--mdb-row-tint:#e7f6ec');
    expect(body).toContain('--mdb-row-tint:#fcebec');
    expect(body).toContain('--mdb-row-tint:#fdf3e2');
  });

  it('色の宣言が無くても、結果の OK / NG / 保留 には色を付ける', () => {
    const plain = SHEET.split('\n').filter((line) => !line.startsWith('#@ style')).join('\n');
    const result = previewMarkdown(plain);
    if (!result.ok) throw new Error(result.reason);
    expect(result.bodyHtml).toMatch(/--mdb-row-tint:#[0-9a-f]{6}/);
  });

  it('セルの中身は文字として出し、\n は改行にする', () => {
    const body = html();
    expect(body).not.toContain('<script>');
    expect(body).toContain('&lt;script&gt;');
    expect(body).toContain('開く<br>押す');
  });

  it('表題・注記を出す', () => {
    const body = html();
    expect(body).toContain('ログイン検証');
    expect(body).toContain('結果は人が付ける');
  });

  it('PDF 出力では表題を文書名に、文書番号を付けたものをファイル名にする', () => {
    const result = loadMarkdown(SHEET);
    if (!result.ok) throw new Error(result.reason);
    expect(result.pluginId).toBe('test-spec-tsv');
    expect(result.documentTitle).toBe('ログイン検証');
    expect(result.pdfFileName).toBe('TEST-001_ログイン検証');
    expect(result.bodyHtml).toContain('待つ');
  });
});
