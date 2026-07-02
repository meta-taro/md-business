import { describe, it, expect } from 'vitest';
import {
  translateDbSpecError,
  translateDbSpecErrors,
  translateDbSpecWarning,
  translateDbSpecWarnings,
} from '../src/index.js';

describe('translateDbSpecError — required keyword', () => {
  it('retargets to the missing root child property (tables)', () => {
    const msg = translateDbSpecError({
      path: '/',
      message: "must have required property 'tables'",
      keyword: 'required',
    });
    expect(msg).toBe('テーブル定義は必須項目です');
  });

  it('retargets to nested missing property (tables[0].name)', () => {
    const msg = translateDbSpecError({
      path: '/tables/0',
      message: "must have required property 'name'",
      keyword: 'required',
    });
    expect(msg).toBe('テーブル[1]の名前は必須項目です');
  });

  it('retargets to nested missing property (tables[0].columns[1].type)', () => {
    const msg = translateDbSpecError({
      path: '/tables/0/columns/1',
      message: "must have required property 'type'",
      keyword: 'required',
    });
    expect(msg).toBe('テーブル[1]の列[2]の型は必須項目です');
  });

  it('retargets to fk missing property (column)', () => {
    const msg = translateDbSpecError({
      path: '/tables/0/columns/0/fk',
      message: "must have required property 'column'",
      keyword: 'required',
    });
    expect(msg).toBe('テーブル[1]の列[1]の外部キー参照先列は必須項目です');
  });

  it('falls back when the missing property name cannot be parsed', () => {
    const msg = translateDbSpecError({
      path: '/',
      message: 'must have required property',
      keyword: 'required',
    });
    expect(msg).toBe('ドキュメント全体は必須項目です');
  });
});

describe('translateDbSpecError — common keywords', () => {
  it('minLength reads as "空にできません"', () => {
    const msg = translateDbSpecError({
      path: '/title',
      message: 'must NOT have fewer than 1 characters',
      keyword: 'minLength',
    });
    expect(msg).toBe('タイトルは空にできません');
  });

  it('minItems reads as "1 件以上必要" for tables', () => {
    const msg = translateDbSpecError({
      path: '/tables',
      message: 'must NOT have fewer than 1 items',
      keyword: 'minItems',
    });
    expect(msg).toBe('テーブル定義は 1 件以上必要です');
  });

  it('minItems reads as "1 件以上必要" for table columns', () => {
    const msg = translateDbSpecError({
      path: '/tables/0/columns',
      message: 'must NOT have fewer than 1 items',
      keyword: 'minItems',
    });
    expect(msg).toBe('テーブル[1]の列定義は 1 件以上必要です');
  });

  it('type error names the expected type in Japanese', () => {
    const msg = translateDbSpecError({
      path: '/tables',
      message: 'must be array',
      keyword: 'type',
    });
    expect(msg).toBe('テーブル定義は配列である必要があります');
  });

  it('enum error surfaces allowed values for status', () => {
    const msg = translateDbSpecError({
      path: '/status',
      message: 'must be equal to one of the allowed values',
      keyword: 'enum',
    });
    expect(msg).toContain('ステータス');
    expect(msg).toContain('draft / review / approved / deprecated');
  });

  it('enum error surfaces allowed values for engine', () => {
    const msg = translateDbSpecError({
      path: '/engine',
      message: 'must be equal to one of the allowed values',
      keyword: 'enum',
    });
    expect(msg).toContain('エンジン');
    expect(msg).toContain('postgres');
    expect(msg).toContain('cloudsql');
  });

  it('enum error surfaces allowed values for fk onDelete', () => {
    const msg = translateDbSpecError({
      path: '/tables/0/columns/2/fk/onDelete',
      message: 'must be equal to one of the allowed values',
      keyword: 'enum',
    });
    expect(msg).toContain('削除時動作');
    expect(msg).toContain('cascade');
    expect(msg).toContain('set_null');
  });

  it('enum error surfaces allowed values for index using', () => {
    const msg = translateDbSpecError({
      path: '/tables/1/indexes/0/using',
      message: 'must be equal to one of the allowed values',
      keyword: 'enum',
    });
    expect(msg).toContain('テーブル[2]のインデックス[1]の方式');
    expect(msg).toContain('btree');
    expect(msg).toContain('brin');
  });

  it('pattern error on version cites SemVer hint', () => {
    const msg = translateDbSpecError({
      path: '/version',
      message: 'must match pattern',
      keyword: 'pattern',
    });
    expect(msg).toContain('版');
    expect(msg).toContain('SemVer');
  });

  it('format error on issueDate cites YYYY-MM-DD hint', () => {
    const msg = translateDbSpecError({
      path: '/issueDate',
      message: 'must match format',
      keyword: 'format',
    });
    expect(msg).toContain('発行日');
    expect(msg).toContain('YYYY-MM-DD');
  });

  it('additionalProperties surfaces the offending key', () => {
    const msg = translateDbSpecError({
      path: '/',
      message: "must NOT have additional properties 'foo'",
      keyword: 'additionalProperties',
    });
    expect(msg).toContain('未知のキー');
    expect(msg).toContain('foo');
  });

  it('additionalProperties on a nested column surfaces the parent label', () => {
    const msg = translateDbSpecError({
      path: '/tables/0/columns/1',
      message: "must NOT have additional properties 'primary'",
      keyword: 'additionalProperties',
    });
    expect(msg).toContain('テーブル[1]の列[2]');
    expect(msg).toContain('primary');
  });

  it('const mismatch on schema', () => {
    const msg = translateDbSpecError({
      path: '/schema',
      message: 'must be equal to constant',
      keyword: 'const',
    });
    expect(msg).toBe('スキーマバージョンの値が固定値と一致しません');
  });

  it('unknown keyword falls back to label + raw message', () => {
    const msg = translateDbSpecError({
      path: '/title',
      message: 'mystery violation',
      keyword: 'mystery',
    });
    expect(msg).toBe('タイトル: mystery violation');
  });

  it('unknown path falls back to raw instancePath without leading slash', () => {
    const msg = translateDbSpecError({
      path: '/wildcard',
      message: 'must be string',
      keyword: 'type',
    });
    expect(msg).toContain('wildcard');
  });

  it('returns ドキュメント全体 for path "" or "/"', () => {
    const msg = translateDbSpecError({
      path: '',
      message: 'mystery',
      keyword: 'mystery',
    });
    expect(msg).toBe('ドキュメント全体: mystery');
  });
});

describe('translateDbSpecErrors — batch', () => {
  it('maps an array of errors to an array of Japanese strings', () => {
    const out = translateDbSpecErrors([
      { path: '/title', message: 'must NOT have fewer than 1 characters', keyword: 'minLength' },
      { path: '/tables', message: 'must NOT have fewer than 1 items', keyword: 'minItems' },
    ]);
    expect(out).toEqual(['タイトルは空にできません', 'テーブル定義は 1 件以上必要です']);
  });
});

describe('translateDbSpecWarning', () => {
  it('translates a "Multiple input keys" collision warning', () => {
    const msg = translateDbSpecWarning({
      path: 'title',
      message: 'Multiple input keys mapped to "title" ...',
    });
    expect(msg).toContain('タイトル');
    expect(msg).toContain('複数の入力キー');
  });

  it('translates a nested path with bracket indices inside tables', () => {
    const msg = translateDbSpecWarning({
      path: 'tables[0].columns[1].name',
      message: '列名 "id" が重複しています。',
    });
    expect(msg).toContain('テーブル[1]の列[2]の名前');
    expect(msg).toContain('重複');
  });

  it('translates a batch of warnings', () => {
    const out = translateDbSpecWarnings([
      { path: 'title', message: 'Multiple input keys mapped to "title" ...' },
      { path: 'tables[1].name', message: 'Multiple input keys mapped to "name" ...' },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]).toContain('タイトル');
    expect(out[1]).toContain('テーブル[2]の名前');
  });
});
