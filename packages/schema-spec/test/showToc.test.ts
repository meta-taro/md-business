import { describe, it, expect } from 'vitest';
import validate from '../dist/validate.compiled.js';
import { parseSpecMarkdown } from '../src/parseSpec.js';
import { translateSpecErrors } from '../src/translateError.js';

const doc = (line: string): string =>
  [
    '---',
    'スキーマ: spec/v1',
    '文書番号: SPEC-001',
    'タイトル: 設計書',
    '発行日: 2026-11-05',
    '作成者:',
    '  - 名前: 担当',
    line,
    '---',
    '# 本文',
    '',
  ].join('\n');

describe('目次表示（showToc）', () => {
  it('日本語の項目名で目次を出す指定ができる', () => {
    const result = parseSpecMarkdown(doc('目次表示: true'), validate);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.spec.showToc).toBe(true);
  });

  it('書かなければ指定なし（目次は出さない）', () => {
    const result = parseSpecMarkdown(doc(''), validate);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.spec.showToc).toBeUndefined();
  });

  it('真偽値でなければ、項目名を日本語で示して断る', () => {
    const result = parseSpecMarkdown(doc('目次表示: 出す'), validate);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const messages = translateSpecErrors(result.errors).join('\n');
    expect(messages).toContain('目次表示');
  });
});
