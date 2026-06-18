import { describe, it, expect } from 'vitest';
import validate from '../dist/validate.compiled.js';
import { parseTestSpecMarkdown, parseTestSpecObject } from '../src/parseTestSpec.js';

describe('parseTestSpecMarkdown — Japanese frontmatter end-to-end', () => {
  it('parses a minimal Japanese-keyed Markdown document', () => {
    const src = [
      '---',
      '文書番号: TEST-2026-001',
      'タイトル: ログイン機能 検証シート',
      '発行日: 2026-06-18',
      '作成者:',
      '  - 名前: 田中',
      '    役割: QA Lead',
      '列:',
      '  - 名前: 項目',
      '    型: 文字列',
      '  - 名前: 結果',
      '    型: プルダウン',
      '    値:',
      '      - OK',
      '      - NG',
      '---',
      '',
      '# 本文',
      '',
    ].join('\n');
    const result = parseTestSpecMarkdown(src, validate);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.testSpec.schema).toBe('test-spec/v1');
    expect(result.testSpec.documentNumber).toBe('TEST-2026-001');
    expect(result.testSpec.status).toBe('draft');
    expect(result.testSpec.columns).toEqual([
      { name: '項目', type: 'text' },
      { name: '結果', type: 'enum', values: ['OK', 'NG'] },
    ]);
    expect(result.body).toContain('# 本文');
  });

  it('returns ok=false when required fields are missing', () => {
    const src = `---\nタイトル: 仕様書\n---\n# 本文\n`;
    const result = parseTestSpecMarkdown(src, validate);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe('parseTestSpecObject — frontmatter object path', () => {
  it('validates a minimal Japanese-keyed object after autofill', () => {
    const result = parseTestSpecObject(
      {
        文書番号: 'TEST-2026-002',
        タイトル: 'テスト',
        発行日: '2026-06-18',
        作成者: [{ 名前: '田中' }],
        列: [{ 名前: '項目', 型: '文字列' }],
      },
      validate,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.testSpec.schema).toBe('test-spec/v1');
    expect(result.testSpec.version).toBe('0.1.0');
    expect(result.testSpec.status).toBe('draft');
    expect(result.testSpec.columns).toEqual([{ name: '項目', type: 'text' }]);
  });

  it('surfaces a normalize collision warning alongside validated data', () => {
    const result = parseTestSpecObject(
      {
        文書番号: 'TEST-2026-003',
        タイトル: 'A',
        表題: 'B',
        発行日: '2026-06-18',
        作成者: [{ 名前: '田中' }],
        列: [{ 名前: '項目', 型: '文字列' }],
      },
      validate,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings.some((w) => w.path === 'title')).toBe(true);
  });

  it('surfaces autofill warning for type=enum without values', () => {
    const result = parseTestSpecObject(
      {
        文書番号: 'TEST-2026-004',
        タイトル: 'enum 検証',
        発行日: '2026-06-18',
        作成者: [{ 名前: '田中' }],
        列: [{ 名前: '結果', 型: 'プルダウン' }],
      },
      validate,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.warnings.some((w) => w.path === 'columns[0].values')).toBe(true);
  });

  it('fails with ValidationError when an unknown column type survives normalization', () => {
    const result = parseTestSpecObject(
      {
        文書番号: 'TEST-2026-005',
        タイトル: '不明型',
        発行日: '2026-06-18',
        作成者: [{ 名前: '田中' }],
        列: [{ 名前: '項目', 型: 'guid' }],
      },
      validate,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.path.includes('type'))).toBe(true);
  });

  it('fails with ValidationError when the input is not an object', () => {
    const result = parseTestSpecObject(42, validate);
    expect(result.ok).toBe(false);
  });
});
