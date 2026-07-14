import { describe, it, expect } from 'vitest';
import type { ValidationError } from '@md-business/core';
import {
  translateNosqlDbSpecError,
  translateNosqlDbSpecErrors,
  translateNosqlDbSpecWarning,
  translateNosqlDbSpecWarnings,
} from '../src/index.js';

function err(
  path: string,
  message: string,
  keyword: string,
): ValidationError {
  return { path, message, keyword };
}

describe('translateNosqlDbSpecError — required', () => {
  it('retargets a root-level missing property', () => {
    const msg = translateNosqlDbSpecError(
      err('/', "must have required property 'engine'", 'required'),
    );
    expect(msg).toBe('エンジンは必須項目です');
  });

  it('retargets a collection-level missing property with N+1 index', () => {
    const msg = translateNosqlDbSpecError(
      err('/collections/0', "must have required property 'docIdStrategy'", 'required'),
    );
    expect(msg).toBe('コレクション[1]のドキュメントID戦略は必須項目です');
  });

  it('retargets the composite conditional partitionKeyField requirement', () => {
    const msg = translateNosqlDbSpecError(
      err('/collections/1', "must have required property 'partitionKeyField'", 'required'),
    );
    expect(msg).toBe('コレクション[2]のパーティションキーは必須項目です');
  });
});

describe('translateNosqlDbSpecError — value constraints', () => {
  it('translates minLength', () => {
    const msg = translateNosqlDbSpecError(
      err('/collections/0/path', 'must NOT have fewer than 1 characters', 'minLength'),
    );
    expect(msg).toBe('コレクション[1]のパスは空にできません');
  });

  it('translates minItems', () => {
    const msg = translateNosqlDbSpecError(
      err('/collections/0/indexes/0/fields', 'must NOT have fewer than 1 items', 'minItems'),
    );
    expect(msg).toBe('コレクション[1]のインデックス[1]の対象フィールドは 1 件以上必要です');
  });

  it('translates minProperties on shape', () => {
    const msg = translateNosqlDbSpecError(
      err('/collections/0/shape', 'must NOT have fewer than 1 properties', 'minProperties'),
    );
    expect(msg).toContain('コレクション[1]の形状');
    expect(msg).toContain('1 つ以上のフィールド');
  });

  it('translates type with a Japanese type label', () => {
    const msg = translateNosqlDbSpecError(
      err('/multiRegion', 'must be boolean', 'type'),
    );
    expect(msg).toBe('マルチリージョンは真偽値（true/false）である必要があります');
  });

  it('translates const mismatch', () => {
    const msg = translateNosqlDbSpecError(
      err('/schema', 'must be equal to constant', 'const'),
    );
    expect(msg).toContain('スキーマバージョン');
    expect(msg).toContain('固定値');
  });
});

describe('translateNosqlDbSpecError — enum hints', () => {
  it.each([
    ['/status', 'ドラフト / レビュー中 / 承認済 / 廃止'],
    ['/engine', 'firestore / dynamodb / mongodb / cosmosdb / redis / documentdb / turso-document'],
    ['/collections/0/docIdStrategy', 'uuid / auto / auth-uid / composite'],
    ['/collections/0/indexes/1/scope', 'collection / collection-group'],
    ['/collections/0/indexes/1/mode', 'ASCENDING / DESCENDING'],
    ['/securityRules/0/allow/2', 'read / write / get / list / create / update / delete'],
  ])('%s lists its allowed values', (path, expected) => {
    const msg = translateNosqlDbSpecError(
      err(path, 'must be equal to one of the allowed values', 'enum'),
    );
    expect(msg).toContain(expected);
  });

  it('substitutes the dynamic shape field name into the type label', () => {
    const msg = translateNosqlDbSpecError(
      err('/collections/0/shape/表示名/type', 'must be equal to one of the allowed values', 'enum'),
    );
    expect(msg).toContain('コレクション[1]のフィールド「表示名」の型');
    expect(msg).toContain('string / number / boolean / timestamp / map / array / reference / geopoint / bytes / null');
  });

  it('handles nested map shapes with two dynamic field names', () => {
    const msg = translateNosqlDbSpecError(
      err('/collections/0/shape/meta/shape/region/type', 'must be equal to one of the allowed values', 'enum'),
    );
    expect(msg).toContain('コレクション[1]のフィールド「meta」の入れ子フィールド「region」の型');
  });

  it('handles array element type via of', () => {
    const msg = translateNosqlDbSpecError(
      err('/collections/0/shape/tags/of/type', 'must be equal to one of the allowed values', 'enum'),
    );
    expect(msg).toContain('コレクション[1]のフィールド「tags」の要素の型');
  });

  it('falls back to a generic message when no hint exists', () => {
    const msg = translateNosqlDbSpecError(
      err('/theme', 'must be equal to one of the allowed values', 'enum'),
    );
    expect(msg).toContain('許可されていない値');
  });
});

describe('translateNosqlDbSpecError — pattern / format', () => {
  it('hints SemVer for /version', () => {
    const msg = translateNosqlDbSpecError(
      err('/version', 'must match pattern', 'pattern'),
    );
    expect(msg).toContain('SemVer');
  });

  it('falls back for unhinted pattern paths', () => {
    const msg = translateNosqlDbSpecError(
      err('/documentNumber', 'must match pattern', 'pattern'),
    );
    expect(msg).toContain('形式が不正');
  });

  it('hints YYYY-MM-DD for /issueDate', () => {
    const msg = translateNosqlDbSpecError(
      err('/issueDate', 'must match format "date"', 'format'),
    );
    expect(msg).toContain('YYYY-MM-DD');
  });

  it('falls back for unhinted format paths', () => {
    const msg = translateNosqlDbSpecError(
      err('/title', 'must match format', 'format'),
    );
    expect(msg).toContain('形式が不正');
  });
});

describe('translateNosqlDbSpecError — additionalProperties', () => {
  it('surfaces the unknown key when quoted in the message', () => {
    const msg = translateNosqlDbSpecError(
      err('/collections/0', "must NOT have additional properties ('カラム')", 'additionalProperties'),
    );
    expect(msg).toContain('コレクション[1]');
    expect(msg).toContain('「カラム」');
  });

  it('falls back when the key is not quoted', () => {
    const msg = translateNosqlDbSpecError(
      err('/', 'must NOT have additional properties', 'additionalProperties'),
    );
    expect(msg).toContain('未知のキーが含まれています');
  });
});

describe('translateNosqlDbSpecError — fallbacks', () => {
  it('passes through unknown keywords with the label prefix', () => {
    const msg = translateNosqlDbSpecError(
      err('/collections/0/ttl/enabled', 'some ajv message', 'maximum'),
    );
    expect(msg).toBe('コレクション[1]の TTL 有効フラグ: some ajv message');
  });

  it('uses the raw path for paths outside the label dictionary', () => {
    const msg = translateNosqlDbSpecError(
      err('/somewhere/else', 'oops', 'maximum'),
    );
    expect(msg).toBe('somewhere/else: oops');
  });

  it('labels the document root', () => {
    const msg = translateNosqlDbSpecError(err('/', 'must be object', 'type'));
    expect(msg).toContain('ドキュメント全体');
  });

  it('maps arrays of errors', () => {
    const msgs = translateNosqlDbSpecErrors([
      err('/', "must have required property 'title'", 'required'),
      err('/', "must have required property 'collections'", 'required'),
    ]);
    expect(msgs).toEqual([
      'タイトルは必須項目です',
      'コレクション定義は必須項目です',
    ]);
  });
});

describe('translateNosqlDbSpecWarning', () => {
  it('translates normalize collision warnings with bracket paths', () => {
    const msg = translateNosqlDbSpecWarning({
      path: 'collections[1].path',
      message: 'Multiple input keys mapped to "path" — the later occurrence wins. Use a single canonical key.',
    });
    expect(msg).toContain('コレクション[2]のパス');
    expect(msg).toContain('複数の入力キー');
  });

  it('passes autofill warnings through with a label prefix', () => {
    const msg = translateNosqlDbSpecWarning({
      path: 'collections[0].ttl.field',
      message: 'TTL フィールド "expiresAt" が shape に宣言されていません。',
    });
    expect(msg).toContain('コレクション[1]の TTL 対象フィールド');
    expect(msg).toContain('expiresAt');
  });

  it('maps arrays of warnings', () => {
    const msgs = translateNosqlDbSpecWarnings([
      { path: 'title', message: 'x' },
      { path: 'engine', message: 'y' },
    ]);
    expect(msgs).toEqual(['タイトル: x', 'エンジン: y']);
  });
});
