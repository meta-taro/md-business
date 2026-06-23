import { describe, it, expect } from 'vitest';
import { normalizeTestSpecFrontmatter } from '../src/index.js';

describe('normalizeTestSpecFrontmatter — root scope', () => {
  it('returns empty data when given a non-object', () => {
    expect(normalizeTestSpecFrontmatter(null).data).toEqual({});
    expect(normalizeTestSpecFrontmatter('x').data).toEqual({});
    expect(normalizeTestSpecFrontmatter(42).data).toEqual({});
  });

  it('translates canonical Japanese root keys to English', () => {
    const { data, warnings } = normalizeTestSpecFrontmatter({
      スキーマ: 'test-spec/v1',
      文書番号: 'TEST-2026-001',
      タイトル: 'ログイン機能 検証シート',
      版: '0.1.0',
      発行日: '2026-06-18',
      ステータス: 'ドラフト',
      作成者: [{ 名前: '田中', 役割: 'QA Lead' }],
      レビュアー: [{ 名前: '佐藤' }],
      関連文書: ['./PRD.md'],
      シートID: '1AbcD_Sheet',
      同期先リポジトリ: 'meta-taro/md-business@main:verify/login.md',
      列: [{ 名前: '項目', 型: '文字列' }],
      テーマ: '青',
      ファイル名: '{documentNumber}.pdf',
    });
    expect(warnings).toEqual([]);
    expect(data).toMatchObject({
      schema: 'test-spec/v1',
      documentNumber: 'TEST-2026-001',
      title: 'ログイン機能 検証シート',
      version: '0.1.0',
      issueDate: '2026-06-18',
      status: 'draft',
      relatedDocs: ['./PRD.md'],
      googleSheetId: '1AbcD_Sheet',
      repository: 'meta-taro/md-business@main:verify/login.md',
      theme: 'blue',
      fileName: '{documentNumber}.pdf',
    });
    expect(data.authors).toEqual([{ name: '田中', role: 'QA Lead' }]);
    expect(data.reviewers).toEqual([{ name: '佐藤' }]);
    expect(data.columns).toEqual([{ name: '項目', type: 'text' }]);
  });

  it.each([
    ['同期先リポジトリ'],
    ['同期先'],
    ['リポジトリ'],
    ['リポ'],
    ['repository'],
    ['repo'],
  ])('maps root key "%s" → repository', (key) => {
    const { data } = normalizeTestSpecFrontmatter({ [key]: 'o/r@main:x.md' });
    expect(data.repository).toBe('o/r@main:x.md');
  });

  it('accepts English keys verbatim (idempotent)', () => {
    const english = {
      schema: 'test-spec/v1',
      documentNumber: 'T1',
      title: 't',
      version: '0.1.0',
      issueDate: '2026-06-18',
      status: 'draft',
      authors: [{ name: 'a' }],
      columns: [{ name: 'c', type: 'text' }],
    };
    const { data } = normalizeTestSpecFrontmatter(english);
    expect(data).toMatchObject(english);
  });
});

describe('normalizeTestSpecFrontmatter — status translations', () => {
  it.each([
    ['ドラフト', 'draft'],
    ['下書き', 'draft'],
    ['レビュー中', 'review'],
    ['査読中', 'review'],
    ['実施中', 'executing'],
    ['検証中', 'executing'],
    ['完了', 'completed'],
    ['完了済', 'completed'],
    ['draft', 'draft'],
    ['review', 'review'],
    ['executing', 'executing'],
    ['completed', 'completed'],
  ])('maps status "%s" → "%s"', (input, expected) => {
    const { data } = normalizeTestSpecFrontmatter({ ステータス: input });
    expect(data.status).toBe(expected);
  });

  it('passes through an unknown status value (Ajv will reject)', () => {
    const { data } = normalizeTestSpecFrontmatter({ ステータス: '保留' });
    expect(data.status).toBe('保留');
  });
});

describe('normalizeTestSpecFrontmatter — column type translations', () => {
  it.each([
    ['文字列', 'text'],
    ['テキスト', 'text'],
    ['複数行', 'multiline_text'],
    ['複数行テキスト', 'multiline_text'],
    ['プルダウン', 'enum'],
    ['選択', 'enum'],
    ['日付', 'date'],
    ['数値', 'number'],
    ['数字', 'number'],
    ['チェックボックス', 'checkbox'],
    ['チェック', 'checkbox'],
    ['bool', 'checkbox'],
    ['URL', 'url'],
    ['リンク', 'url'],
  ])('maps column type "%s" → "%s"', (input, expected) => {
    const { data } = normalizeTestSpecFrontmatter({
      列: [{ 名前: 'X', 型: input }],
    });
    expect(data.columns).toEqual([{ name: 'X', type: expected }]);
  });
});

describe('normalizeTestSpecFrontmatter — theme translations', () => {
  it.each([
    ['青', 'blue'],
    ['ブルー', 'blue'],
    ['赤', 'red'],
    ['オレンジ', 'orange'],
    ['黒', 'black'],
    ['グレー', 'gray'],
  ])('maps theme "%s" → "%s"', (input, expected) => {
    const { data } = normalizeTestSpecFrontmatter({ テーマ: input });
    expect(data.theme).toBe(expected);
  });
});

describe('normalizeTestSpecFrontmatter — visual scope', () => {
  it('translates visual style keys (行背景 / 背景 / 文字色)', () => {
    const { data } = normalizeTestSpecFrontmatter({
      列: [
        {
          名前: '結果',
          型: 'プルダウン',
          値: ['OK', 'NG'],
          書式: {
            OK: { 行背景: '#e6f4ea', 文字色: '#137333' },
            NG: { 背景色: '#fce8e6' },
          },
        },
      ],
    });
    expect(data.columns).toEqual([
      {
        name: '結果',
        type: 'enum',
        values: ['OK', 'NG'],
        visual: {
          OK: { row_background: '#e6f4ea', color: '#137333' },
          NG: { background: '#fce8e6' },
        },
      },
    ]);
  });
});

describe('normalizeTestSpecFrontmatter — column required / widthScale / wrap', () => {
  it.each([
    ['必須', 'required'],
    ['幅倍率', 'widthScale'],
    ['列幅倍率', 'widthScale'],
    ['幅', 'widthScale'],
    ['折り返し', 'wrap'],
    ['改行', 'wrap'],
    ['ラップ', 'wrap'],
  ])('maps column key "%s" → "%s"', (input, expected) => {
    const { data } = normalizeTestSpecFrontmatter({
      列: [{ 名前: 'X', 型: 'text', [input]: input === '必須' ? false : input.includes('折') || input === '改行' || input === 'ラップ' ? true : 2 }],
    });
    const cols = data.columns as Array<Record<string, unknown>>;
    expect(Object.keys(cols[0]!)).toContain(expected);
  });

  it('keeps required:false / widthScale / wrap values verbatim', () => {
    const { data } = normalizeTestSpecFrontmatter({
      列: [
        { 名前: '実施日', 型: '日付', 必須: false, 幅倍率: 1.2 },
        { 名前: '備考', 型: '複数行', 幅倍率: 3, 折り返し: true },
      ],
    });
    expect(data.columns).toEqual([
      { name: '実施日', type: 'date', required: false, widthScale: 1.2 },
      { name: '備考', type: 'multiline_text', widthScale: 3, wrap: true },
    ]);
  });
});

describe('normalizeTestSpecFrontmatter — party scope', () => {
  it('translates author/reviewer names and roles', () => {
    const { data } = normalizeTestSpecFrontmatter({
      作成者: [
        { 名前: '田中', 役割: 'QA Lead' },
        { 氏名: '鈴木', 役職: 'QA' },
      ],
      レビュアー: [{ 名称: '佐藤', 肩書き: 'PM' }],
    });
    expect(data.authors).toEqual([
      { name: '田中', role: 'QA Lead' },
      { name: '鈴木', role: 'QA' },
    ]);
    expect(data.reviewers).toEqual([{ name: '佐藤', role: 'PM' }]);
  });
});

describe('normalizeTestSpecFrontmatter — warnings', () => {
  it('warns when two source keys collapse to the same target at root', () => {
    const { warnings } = normalizeTestSpecFrontmatter({
      タイトル: 'A',
      表題: 'B',
    });
    expect(warnings.length).toBeGreaterThan(0);
    const first = warnings[0]!;
    expect(first.path).toBe('title');
  });

  it('reports nested collision paths inside columns', () => {
    const { warnings } = normalizeTestSpecFrontmatter({
      列: [{ 名前: '項目', 列名: '項目2' }],
    });
    expect(warnings.some((w) => w.path === 'columns[0].name')).toBe(true);
  });
});

describe('normalizeTestSpecFrontmatter — pass-through unknown keys', () => {
  it('keeps unknown root keys verbatim for Ajv to surface', () => {
    const { data } = normalizeTestSpecFrontmatter({ 不明: 'x', タイトル: 't' });
    expect(data).toMatchObject({ 不明: 'x', title: 't' });
  });
});
