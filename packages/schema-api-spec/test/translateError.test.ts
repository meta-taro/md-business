import { describe, it, expect } from 'vitest';
import {
  translateApiSpecError,
  translateApiSpecErrors,
  translateApiSpecWarning,
  translateApiSpecWarnings,
} from '../src/index.js';
import type { ValidationError } from '@md-business/core';

function err(partial: Partial<ValidationError>): ValidationError {
  return {
    keyword: 'type',
    path: '/',
    message: 'must be string',
    ...partial,
  };
}

describe('translateApiSpecError — required', () => {
  it('names the missing root property', () => {
    const msg = translateApiSpecError(
      err({ keyword: 'required', path: '/', message: "must have required property 'title'" }),
    );
    expect(msg).toBe('タイトルは必須項目です');
  });

  it('names a missing nested endpoint property', () => {
    const msg = translateApiSpecError(
      err({
        keyword: 'required',
        path: '/endpoints/0',
        message: "must have required property 'method'",
      }),
    );
    expect(msg).toBe('エンドポイント[1]のメソッドは必須項目です');
  });
});

describe('translateApiSpecError — compositional labels', () => {
  it('labels a deeply nested request body field type error', () => {
    const msg = translateApiSpecError(
      err({
        keyword: 'enum',
        path: '/endpoints/0/request/body/fields/2/type',
        message: 'must be equal to one of the allowed values',
      }),
    );
    expect(msg).toContain('エンドポイント[1]のリクエストのボディのフィールド[3]の型');
    expect(msg).toContain('string / integer / number / boolean / array / object / date / datetime');
  });

  it('labels a nested "of" element (arbitrary depth) without an enumerated table', () => {
    const msg = translateApiSpecError(
      err({
        keyword: 'type',
        path: '/endpoints/1/responses/0/body/fields/0/of/3/name',
        message: 'must be string',
      }),
    );
    expect(msg).toBe(
      'エンドポイント[2]のレスポンス[1]のボディのフィールド[1]の要素[4]の名前は文字列である必要があります',
    );
  });
});

describe('translateApiSpecError — enum hints by trailing segment', () => {
  it.each([
    ['/status', 'draft / review / approved / deprecated'],
    ['/protocol', 'rest / rpc / graphql'],
    ['/auth', 'none / bearer / apiKey / oauth2 / basic'],
    ['/endpoints/0/method', 'GET / POST / PUT / PATCH / DELETE / HEAD / OPTIONS'],
    ['/endpoints/0/auth', 'none / bearer / apiKey / oauth2 / basic'],
  ])('adds the allowed-values hint for %s', (path, hint) => {
    const msg = translateApiSpecError(
      err({ keyword: 'enum', path, message: 'must be equal to one of the allowed values' }),
    );
    expect(msg).toContain(hint);
  });
});

describe('translateApiSpecError — pattern / format', () => {
  it('gives a SemVer hint for version', () => {
    const msg = translateApiSpecError(
      err({ keyword: 'pattern', path: '/version', message: 'must match pattern' }),
    );
    expect(msg).toContain('SemVer');
  });

  it('gives a dbRef hint for a field dbRef pattern failure', () => {
    const msg = translateApiSpecError(
      err({
        keyword: 'pattern',
        path: '/endpoints/0/responses/0/body/fields/0/dbRef',
        message: 'must match pattern',
      }),
    );
    expect(msg).toContain('<文書番号>#<テーブル>.<列>');
  });

  it('gives a date hint for issueDate format failure', () => {
    const msg = translateApiSpecError(
      err({ keyword: 'format', path: '/issueDate', message: 'must match format "date"' }),
    );
    expect(msg).toContain('YYYY-MM-DD');
  });
});

describe('translateApiSpecError — misc keywords', () => {
  it('handles minItems on endpoints', () => {
    const msg = translateApiSpecError(
      err({ keyword: 'minItems', path: '/endpoints', message: 'must NOT have fewer than 1 items' }),
    );
    expect(msg).toBe('エンドポイントは 1 件以上必要です');
  });

  it('handles a numeric range error on a response status', () => {
    const msg = translateApiSpecError(
      err({
        keyword: 'maximum',
        path: '/endpoints/0/responses/0/status',
        message: 'must be <= 599',
      }),
    );
    expect(msg).toContain('範囲外');
  });

  it('handles additionalProperties by naming the unknown key', () => {
    const msg = translateApiSpecError(
      err({
        keyword: 'additionalProperties',
        path: '/endpoints/0',
        message: "must NOT have additional properties, 'foo'",
      }),
    );
    expect(msg).toContain('未知のキー「foo」');
    expect(msg).toContain('エンドポイント[1]');
  });

  it('falls back to the raw message for unhandled keywords', () => {
    const msg = translateApiSpecError(
      err({ keyword: 'oneOf', path: '/protocol', message: 'must match exactly one schema' }),
    );
    expect(msg).toBe('プロトコル: must match exactly one schema');
  });
});

describe('translateApiSpecError — batch + warnings', () => {
  it('translateApiSpecErrors maps every error', () => {
    const msgs = translateApiSpecErrors([
      err({ keyword: 'required', path: '/', message: "must have required property 'title'" }),
      err({ keyword: 'minItems', path: '/endpoints', message: 'must NOT have fewer than 1 items' }),
    ]);
    expect(msgs).toEqual(['タイトルは必須項目です', 'エンドポイントは 1 件以上必要です']);
  });

  it('translateApiSpecWarning renders a duplicate-key warning with a composed label', () => {
    const msg = translateApiSpecWarning({
      path: 'endpoints[0].request.body.fields[0].name',
      message: 'Multiple input keys mapped to "name"',
    });
    expect(msg).toContain('エンドポイント[1]のリクエストのボディのフィールド[1]の名前');
    expect(msg).toContain('複数の入力キー');
  });

  it('translateApiSpecWarning passes through a design warning verbatim after the label', () => {
    const msg = translateApiSpecWarning({
      path: 'endpoints[1].operationId',
      message: 'operationId "x" が重複しています。',
    });
    expect(msg).toBe('エンドポイント[2]のオペレーションID: operationId "x" が重複しています。');
  });

  it('translateApiSpecWarnings maps every warning', () => {
    const msgs = translateApiSpecWarnings([
      { path: 'title', message: 'Multiple input keys mapped to "title"' },
    ]);
    expect(msgs[0]).toContain('タイトル');
  });
});
