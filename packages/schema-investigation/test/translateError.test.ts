import { describe, it, expect } from 'vitest';
import {
  translateInvestigationError,
  translateInvestigationErrors,
  translateInvestigationWarning,
  translateInvestigationWarnings,
} from '../src/index.js';

function err(keyword: string, path: string, message: string) {
  return { keyword, path, message };
}

describe('translateInvestigationError', () => {
  it('names the missing field', () => {
    expect(
      translateInvestigationError(
        err('required', '/', "must have required property 'documentNumber'"),
      ),
    ).toBe('文書番号は必須項目です');
  });

  it('names a missing field inside an array item, counted from 1', () => {
    expect(
      translateInvestigationError(
        err('required', '/targets/0', "must have required property 'sha256'"),
      ),
    ).toBe('対象ファイル[1]のハッシュ(SHA-256)は必須項目です');
  });

  it('explains the empty-list case', () => {
    expect(translateInvestigationError(err('minItems', '/targets', 'must NOT have fewer than 1'))).toBe(
      '対象ファイルは 1 件以上必要です',
    );
  });

  it('explains the evidence pattern in terms of what produces it', () => {
    const message = translateInvestigationError(
      err('pattern', '/findings/0/evidence/0', 'must match pattern'),
    );
    expect(message).toContain('所見[1]の根拠[1]');
    expect(message).toContain('evidence/EV-001.md');
  });

  it('explains the SHA-256 pattern', () => {
    const message = translateInvestigationError(err('pattern', '/targets/0/sha256', 'must match'));
    expect(message).toContain('16 進');
  });

  it('lists the allowed values for kind and status', () => {
    expect(translateInvestigationError(err('enum', '/kind', 'must be equal to one of'))).toContain(
      'log / network',
    );
    expect(translateInvestigationError(err('enum', '/status', 'must be equal to one of'))).toContain(
      'investigating',
    );
    expect(
      translateInvestigationError(err('enum', '/findings/0/severity', 'must be equal to one of')),
    ).toContain('high');
  });

  it('explains a date-time format failure', () => {
    expect(translateInvestigationError(err('format', '/createdAt', 'must match format'))).toContain(
      '日時',
    );
  });

  it('reports an unknown key with the key name', () => {
    expect(
      translateInvestigationError(
        err('additionalProperties', '/', 'must NOT have additional properties'),
      ),
    ).toContain('未知のキー');
  });

  it('names the offending key when Ajv quotes it', () => {
    expect(
      translateInvestigationError(err('additionalProperties', '/targets/0', "'ハッシュ値' is invalid")),
    ).toBe('対象ファイル[1] に未知のキー「ハッシュ値」が含まれています');
  });

  it('reports a wrong type in Japanese', () => {
    expect(translateInvestigationError(err('type', '/title', 'must be string'))).toBe(
      'タイトルは文字列である必要があります',
    );
  });

  it('reports an empty string', () => {
    expect(translateInvestigationError(err('minLength', '/title', 'must NOT be shorter'))).toBe(
      'タイトルは空にできません',
    );
  });

  it('reports a mismatched schema id', () => {
    expect(translateInvestigationError(err('const', '/schema', 'must be equal to constant'))).toBe(
      'スキーマの値が固定値と一致しません',
    );
  });

  it('falls back to the raw message for an unmapped keyword', () => {
    expect(translateInvestigationError(err('multipleOf', '/x', 'must be multiple of 2'))).toBe(
      'x: must be multiple of 2',
    );
  });

  it('translates a list at once', () => {
    expect(
      translateInvestigationErrors([
        err('required', '/', "must have required property 'title'"),
        err('minItems', '/tools', 'must NOT have fewer than 1'),
      ]),
    ).toEqual(['タイトルは必須項目です', '使用ツールは 1 件以上必要です']);
  });
});

describe('translateInvestigationWarning', () => {
  it('rewrites the key-collision warning', () => {
    expect(
      translateInvestigationWarning({
        path: 'title',
        message: 'Multiple input keys mapped to "title" — the later occurrence wins.',
      }),
    ).toContain('複数の入力キー');
  });

  it('keeps an already-Japanese warning as is, prefixed with the field label', () => {
    expect(
      translateInvestigationWarning({
        path: 'findings',
        message: '状態が「完了」ですが、所見（findings）が 1 件もありません。',
      }),
    ).toBe('所見: 状態が「完了」ですが、所見（findings）が 1 件もありません。');
  });

  it('translates a list at once', () => {
    expect(
      translateInvestigationWarnings([{ path: 'window', message: 'テスト' }]),
    ).toEqual(['調査時間帯: テスト']);
  });
});
