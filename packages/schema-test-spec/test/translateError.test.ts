import { describe, it, expect } from 'vitest';
import {
  translateTestSpecError,
  translateTestSpecErrors,
  translateTestSpecWarning,
  translateTestSpecWarnings,
} from '../src/index.js';

describe('translateTestSpecError — required keyword', () => {
  it('retargets to the missing root child property (columns)', () => {
    const msg = translateTestSpecError({
      path: '/',
      message: "must have required property 'columns'",
      keyword: 'required',
    });
    expect(msg).toBe('列定義は必須項目です');
  });

  it('retargets to nested missing property (columns[0].name)', () => {
    const msg = translateTestSpecError({
      path: '/columns/0',
      message: "must have required property 'name'",
      keyword: 'required',
    });
    expect(msg).toBe('列[1]の名前は必須項目です');
  });

  it('retargets to nested missing property (columns[0].values) for enum', () => {
    const msg = translateTestSpecError({
      path: '/columns/0',
      message: "must have required property 'values'",
      keyword: 'required',
    });
    expect(msg).toBe('列[1]の選択肢は必須項目です');
  });

  it('retargets to nested missing property (authors[0].name)', () => {
    const msg = translateTestSpecError({
      path: '/authors/0',
      message: "must have required property 'name'",
      keyword: 'required',
    });
    expect(msg).toBe('作成者[1]の名前は必須項目です');
  });

  it('falls back when the missing property name cannot be parsed', () => {
    const msg = translateTestSpecError({
      path: '/',
      message: 'must have required property',
      keyword: 'required',
    });
    expect(msg).toBe('ドキュメント全体は必須項目です');
  });
});

describe('translateTestSpecError — common keywords', () => {
  it('minLength reads as "空にできません"', () => {
    const msg = translateTestSpecError({
      path: '/title',
      message: 'must NOT have fewer than 1 characters',
      keyword: 'minLength',
    });
    expect(msg).toBe('タイトルは空にできません');
  });

  it('minItems reads as "1 件以上必要" for authors', () => {
    const msg = translateTestSpecError({
      path: '/authors',
      message: 'must NOT have fewer than 1 items',
      keyword: 'minItems',
    });
    expect(msg).toBe('作成者は 1 件以上必要です');
  });

  it('minItems reads as "1 件以上必要" for columns', () => {
    const msg = translateTestSpecError({
      path: '/columns',
      message: 'must NOT have fewer than 1 items',
      keyword: 'minItems',
    });
    expect(msg).toBe('列定義は 1 件以上必要です');
  });

  it('type error names the expected type in Japanese', () => {
    const msg = translateTestSpecError({
      path: '/columns',
      message: 'must be array',
      keyword: 'type',
    });
    expect(msg).toBe('列定義は配列である必要があります');
  });

  it('enum error surfaces allowed values for status', () => {
    const msg = translateTestSpecError({
      path: '/status',
      message: 'must be equal to one of the allowed values',
      keyword: 'enum',
    });
    expect(msg).toContain('ステータス');
    expect(msg).toContain('draft / review / executing / completed');
  });

  it('enum error surfaces allowed values for column type', () => {
    const msg = translateTestSpecError({
      path: '/columns/0/type',
      message: 'must be equal to one of the allowed values',
      keyword: 'enum',
    });
    expect(msg).toContain('列[1]の型');
    expect(msg).toContain('text');
    expect(msg).toContain('enum');
  });

  it('pattern error on version cites SemVer hint', () => {
    const msg = translateTestSpecError({
      path: '/version',
      message: 'must match pattern',
      keyword: 'pattern',
    });
    expect(msg).toContain('版');
    expect(msg).toContain('SemVer');
  });

  it('pattern error on visual hex color cites hex color hint', () => {
    const msg = translateTestSpecError({
      path: '/columns/2/visual/OK/row_background',
      message: 'must match pattern',
      keyword: 'pattern',
    });
    expect(msg).toContain('hex');
  });

  it('format error on issueDate cites YYYY-MM-DD hint', () => {
    const msg = translateTestSpecError({
      path: '/issueDate',
      message: 'must match format',
      keyword: 'format',
    });
    expect(msg).toContain('発行日');
    expect(msg).toContain('YYYY-MM-DD');
  });

  it('additionalProperties surfaces the offending key', () => {
    const msg = translateTestSpecError({
      path: '/',
      message: "must NOT have additional properties 'foo'",
      keyword: 'additionalProperties',
    });
    expect(msg).toContain('未知のキー');
    expect(msg).toContain('foo');
  });

  it('additionalProperties on nested column surfaces the parent label', () => {
    const msg = translateTestSpecError({
      path: '/columns/1',
      message: "must NOT have additional properties 'bogus'",
      keyword: 'additionalProperties',
    });
    expect(msg).toContain('列[2]');
    expect(msg).toContain('bogus');
  });

  it('const mismatch on schema', () => {
    const msg = translateTestSpecError({
      path: '/schema',
      message: 'must be equal to constant',
      keyword: 'const',
    });
    expect(msg).toBe('スキーマバージョンの値が固定値と一致しません');
  });

  it('unknown keyword falls back to label + raw message', () => {
    const msg = translateTestSpecError({
      path: '/title',
      message: 'mystery violation',
      keyword: 'mystery',
    });
    expect(msg).toBe('タイトル: mystery violation');
  });

  it('unknown path falls back to raw instancePath without leading slash', () => {
    const msg = translateTestSpecError({
      path: '/wildcard',
      message: 'must be string',
      keyword: 'type',
    });
    expect(msg).toContain('wildcard');
  });
});

describe('translateTestSpecErrors — batch', () => {
  it('maps an array of errors to an array of Japanese strings', () => {
    const out = translateTestSpecErrors([
      { path: '/title', message: 'must NOT have fewer than 1 characters', keyword: 'minLength' },
      { path: '/columns', message: 'must NOT have fewer than 1 items', keyword: 'minItems' },
    ]);
    expect(out).toEqual(['タイトルは空にできません', '列定義は 1 件以上必要です']);
  });
});

describe('translateTestSpecWarning', () => {
  it('translates a "Multiple input keys" collision warning', () => {
    const msg = translateTestSpecWarning({
      path: 'title',
      message: 'Multiple input keys mapped to "title" ...',
    });
    expect(msg).toContain('タイトル');
    expect(msg).toContain('複数の入力キー');
  });

  it('translates a nested path with bracket index inside columns', () => {
    const msg = translateTestSpecWarning({
      path: 'columns[0].values',
      message: '列 "結果" は type=enum ですが values が宣言されていません。',
    });
    expect(msg).toContain('列[1]の選択肢');
  });

  it('passes Japanese autofill warnings through with the field label', () => {
    const msg = translateTestSpecWarning({
      path: 'columns[0].name',
      message: '列名 "項目" が重複しています。',
    });
    expect(msg).toContain('列[1]の名前');
    expect(msg).toContain('重複');
  });

  it('translates a batch of warnings', () => {
    const out = translateTestSpecWarnings([
      { path: 'title', message: 'Multiple input keys mapped to "title" ...' },
      { path: 'columns[1].name', message: 'Multiple input keys mapped to "name" ...' },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]).toContain('タイトル');
    expect(out[1]).toContain('列[2]の名前');
  });
});

describe('translateTestSpecError — root-level edge', () => {
  it('returns ドキュメント全体 for path "" or "/"', () => {
    const msg = translateTestSpecError({
      path: '',
      message: 'mystery',
      keyword: 'mystery',
    });
    expect(msg).toBe('ドキュメント全体: mystery');
  });
});
