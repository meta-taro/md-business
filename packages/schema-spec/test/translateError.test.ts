import { describe, it, expect } from 'vitest';
import {
  translateSpecError,
  translateSpecErrors,
  translateSpecWarning,
  translateSpecWarnings,
} from '../src/index.js';

describe('translateSpecError — required keyword', () => {
  it('retargets to the missing child property (authors)', () => {
    const msg = translateSpecError({
      path: '/',
      message: "must have required property 'authors'",
      keyword: 'required',
    });
    expect(msg).toBe('作成者は必須項目です');
  });

  it('retargets to nested missing property (authors[0].name)', () => {
    const msg = translateSpecError({
      path: '/authors/0',
      message: "must have required property 'name'",
      keyword: 'required',
    });
    expect(msg).toBe('作成者[1]の名前は必須項目です');
  });

  it('falls back when the missing property name cannot be parsed', () => {
    const msg = translateSpecError({
      path: '/',
      message: 'must have required property',
      keyword: 'required',
    });
    expect(msg).toBe('ドキュメント全体は必須項目です');
  });
});

describe('translateSpecError — common keywords', () => {
  it('minLength reads as "空にできません"', () => {
    const msg = translateSpecError({
      path: '/title',
      message: 'must NOT have fewer than 1 characters',
      keyword: 'minLength',
    });
    expect(msg).toBe('タイトルは空にできません');
  });

  it('minItems reads as "1 件以上必要"', () => {
    const msg = translateSpecError({
      path: '/authors',
      message: 'must NOT have fewer than 1 items',
      keyword: 'minItems',
    });
    expect(msg).toBe('作成者は 1 件以上必要です');
  });

  it('type error names the expected type in Japanese', () => {
    const msg = translateSpecError({
      path: '/authors',
      message: 'must be array',
      keyword: 'type',
    });
    expect(msg).toBe('作成者は配列である必要があります');
  });

  it('enum error surfaces allowed values for status', () => {
    const msg = translateSpecError({
      path: '/status',
      message: 'must be equal to one of the allowed values',
      keyword: 'enum',
    });
    expect(msg).toContain('ステータス');
    expect(msg).toContain('draft / review / approved');
  });

  it('enum error surfaces allowed values for toc', () => {
    const msg = translateSpecError({
      path: '/toc',
      message: 'must be equal to one of the allowed values',
      keyword: 'enum',
    });
    expect(msg).toContain('目次');
    expect(msg).toContain('auto / manual');
  });

  it('pattern error on version cites SemVer hint', () => {
    const msg = translateSpecError({
      path: '/version',
      message: 'must match pattern',
      keyword: 'pattern',
    });
    expect(msg).toContain('版');
    expect(msg).toContain('SemVer');
  });

  it('pattern error on chapter entry cites `.md` hint', () => {
    const msg = translateSpecError({
      path: '/chapters/2',
      message: 'must match pattern',
      keyword: 'pattern',
    });
    expect(msg).toContain('章ファイル[3]');
    expect(msg).toContain('.md');
  });

  it('format error on issueDate cites YYYY-MM-DD hint', () => {
    const msg = translateSpecError({
      path: '/issueDate',
      message: 'must match format',
      keyword: 'format',
    });
    expect(msg).toContain('発行日');
    expect(msg).toContain('YYYY-MM-DD');
  });

  it('additionalProperties surfaces the offending key', () => {
    const msg = translateSpecError({
      path: '/',
      message: "must NOT have additional properties 'foo'",
      keyword: 'additionalProperties',
    });
    expect(msg).toContain('未知のキー');
    expect(msg).toContain('foo');
  });

  it('const mismatch on schemaVersion', () => {
    const msg = translateSpecError({
      path: '/schemaVersion',
      message: 'must be equal to constant',
      keyword: 'const',
    });
    expect(msg).toBe('スキーマバージョンの値が固定値と一致しません');
  });

  it('unknown keyword falls back to label + raw message', () => {
    const msg = translateSpecError({
      path: '/title',
      message: 'mystery violation',
      keyword: 'mystery',
    });
    expect(msg).toBe('タイトル: mystery violation');
  });

  it('unknown path falls back to raw instancePath without leading slash', () => {
    const msg = translateSpecError({
      path: '/wildcard',
      message: 'must be string',
      keyword: 'type',
    });
    expect(msg).toContain('wildcard');
  });
});

describe('translateSpecErrors — batch', () => {
  it('maps an array of errors to an array of Japanese strings', () => {
    const out = translateSpecErrors([
      { path: '/title', message: 'must NOT have fewer than 1 characters', keyword: 'minLength' },
      { path: '/authors', message: 'must NOT have fewer than 1 items', keyword: 'minItems' },
    ]);
    expect(out).toEqual(['タイトルは空にできません', '作成者は 1 件以上必要です']);
  });
});

describe('translateSpecWarning', () => {
  it('translates a "Multiple input keys" collision warning', () => {
    const msg = translateSpecWarning({
      path: 'title',
      message: 'Multiple input keys mapped to "title" ...',
    });
    expect(msg).toContain('タイトル');
    expect(msg).toContain('複数の入力キー');
  });

  it('translates a nested path with bracket index', () => {
    const msg = translateSpecWarning({
      path: 'authors[0].name',
      message: 'Multiple input keys mapped to "name" ...',
    });
    expect(msg).toContain('作成者[1]の名前');
  });

  it('passes Japanese autofill warnings through with the field label', () => {
    const msg = translateSpecWarning({
      path: 'chapters',
      message: '目次=手動（toc: manual）の場合、章ファイル（chapters）を 1 件以上指定してください。',
    });
    expect(msg).toContain('章ファイル');
    expect(msg).toContain('目次=手動');
  });

  it('translates a batch of warnings', () => {
    const out = translateSpecWarnings([
      { path: 'toc', message: 'Multiple input keys mapped to "toc" ...' },
      { path: 'title', message: 'Multiple input keys mapped to "title" ...' },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]).toContain('目次');
    expect(out[1]).toContain('タイトル');
  });
});

describe('translateSpecError — root-level edge', () => {
  it('returns ドキュメント全体 for path "" or "/"', () => {
    const msg = translateSpecError({
      path: '',
      message: 'mystery',
      keyword: 'mystery',
    });
    expect(msg).toBe('ドキュメント全体: mystery');
  });
});
