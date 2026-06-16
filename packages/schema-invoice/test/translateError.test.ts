import { describe, it, expect } from 'vitest';
import {
  translateInvoiceError,
  translateInvoiceErrors,
  translateInvoiceWarning,
  translateInvoiceWarnings,
} from '../src/translateError.js';

describe('translateInvoiceError — required keyword', () => {
  it('retargets to the missing child property and reports it as 必須項目', () => {
    const msg = translateInvoiceError({
      path: '/recipient',
      message: "must have required property 'name'",
      keyword: 'required',
    });
    expect(msg).toBe('請求先の名前は必須項目です');
  });

  it('handles top-level required (instancePath="/")', () => {
    const msg = translateInvoiceError({
      path: '/',
      message: "must have required property 'invoiceNumber'",
      keyword: 'required',
    });
    expect(msg).toBe('請求書番号は必須項目です');
  });

  it('falls back when the missing property name cannot be parsed', () => {
    const msg = translateInvoiceError({
      path: '/issuer',
      message: 'must have required property',
      keyword: 'required',
    });
    expect(msg).toBe('発行元は必須項目です');
  });
});

describe('translateInvoiceError — common keywords', () => {
  it('minLength reads as "空にできません"', () => {
    const msg = translateInvoiceError({
      path: '/issuer/name',
      message: 'must NOT have fewer than 1 characters',
      keyword: 'minLength',
    });
    expect(msg).toBe('発行元の名前は空にできません');
  });

  it('minimum reads as "0 以上"', () => {
    const msg = translateInvoiceError({
      path: '/items/0/quantity',
      message: 'must be >= 0',
      keyword: 'minimum',
    });
    expect(msg).toBe('品目[1]の数量は 0 以上の数値である必要があります');
  });

  it('type reports the expected Japanese type label with item index', () => {
    const msg = translateInvoiceError({
      path: '/items/2/unitPrice',
      message: 'must be number',
      keyword: 'type',
    });
    expect(msg).toBe('品目[3]の単価は数値である必要があります');
  });

  it('enum surfaces allowed values when known', () => {
    const msg = translateInvoiceError({
      path: '/items/0/taxRate',
      message: 'must be equal to one of the allowed values',
      keyword: 'enum',
    });
    expect(msg).toBe('品目[1]の税率は 10 / 8 / 0 のいずれかである必要があります');
  });

  it('enum falls back when the path is not in the allowed-values table', () => {
    const msg = translateInvoiceError({
      path: '/unknownField',
      message: 'must be equal to one of the allowed values',
      keyword: 'enum',
    });
    expect(msg).toContain('許可されていない値');
  });

  it('pattern provides a hint for registrationNumber', () => {
    const msg = translateInvoiceError({
      path: '/issuer/registrationNumber',
      message: 'must match pattern',
      keyword: 'pattern',
    });
    expect(msg).toContain('T で始まる 13 桁');
  });

  it('pattern falls back to "形式が不正" when no hint exists', () => {
    const msg = translateInvoiceError({
      path: '/issuer/name',
      message: 'must match pattern',
      keyword: 'pattern',
    });
    expect(msg).toBe('発行元の名前の形式が不正です');
  });

  it('format gives YYYY-MM-DD hint on issueDate', () => {
    const msg = translateInvoiceError({
      path: '/issueDate',
      message: 'must match format "date"',
      keyword: 'format',
    });
    expect(msg).toContain('YYYY-MM-DD');
  });

  it('format defaults to "形式が不正" when no hint exists', () => {
    const msg = translateInvoiceError({
      path: '/notes',
      message: 'must match format',
      keyword: 'format',
    });
    expect(msg).toBe('備考の形式が不正です');
  });

  it('minItems for /items reads as "1 件以上必要"', () => {
    const msg = translateInvoiceError({
      path: '/items',
      message: 'must NOT have fewer than 1 items',
      keyword: 'minItems',
    });
    expect(msg).toBe('品目は 1 件以上必要です');
  });

  it('additionalProperties surfaces the offending key when present', () => {
    const msg = translateInvoiceError({
      path: '/recipient',
      message: "must NOT have additional properties: 'unknownKey'",
      keyword: 'additionalProperties',
    });
    expect(msg).toBe('請求先 に未知のキー「unknownKey」が含まれています');
  });

  it('additionalProperties falls back when no key is extracted', () => {
    const msg = translateInvoiceError({
      path: '/recipient',
      message: 'must NOT have additional properties',
      keyword: 'additionalProperties',
    });
    expect(msg).toBe('請求先 に未知のキーが含まれています');
  });

  it('const reads as "固定値と一致しません"', () => {
    const msg = translateInvoiceError({
      path: '/schemaVersion',
      message: 'must be equal to constant',
      keyword: 'const',
    });
    expect(msg).toBe('スキーマバージョンの値が固定値と一致しません');
  });

  it('unknown keywords pass through with the label prefix', () => {
    const msg = translateInvoiceError({
      path: '/items/0/name',
      message: 'something unexpected',
      keyword: 'unknownKeyword',
    });
    expect(msg).toBe('品目[1]の品名: something unexpected');
  });
});

describe('translateInvoiceError — path fallback', () => {
  it('falls back to the raw path when no label is known', () => {
    const msg = translateInvoiceError({
      path: '/foo/bar',
      message: 'whatever',
      keyword: 'minLength',
    });
    expect(msg).toBe('foo/barは空にできません');
  });

  it('uses "ドキュメント全体" for root path with unrecognized keyword', () => {
    const msg = translateInvoiceError({
      path: '/',
      message: 'broken',
      keyword: 'mystery',
    });
    expect(msg).toBe('ドキュメント全体: broken');
  });
});

describe('translateInvoiceErrors batch helper', () => {
  it('maps an array of errors in order', () => {
    const out = translateInvoiceErrors([
      { path: '/', message: "must have required property 'invoiceNumber'", keyword: 'required' },
      { path: '/recipient', message: "must have required property 'name'", keyword: 'required' },
    ]);
    expect(out).toEqual([
      '請求書番号は必須項目です',
      '請求先の名前は必須項目です',
    ]);
  });
});

describe('translateInvoiceWarning', () => {
  it('rewrites normalize collision warnings to Japanese', () => {
    const msg = translateInvoiceWarning({
      path: 'issuer.name',
      message: 'Multiple input keys mapped to "name" — the later occurrence wins.',
    });
    expect(msg).toContain('発行元の名前');
    expect(msg).toContain('複数の入力キー');
  });

  it('passes through autofill warnings (already Japanese) with a label prefix', () => {
    const msg = translateInvoiceWarning({
      path: 'totals.subtotal',
      message: '指定値 999 と計算値 1000 が一致しません。items から再計算した値を採用します。',
    });
    expect(msg.startsWith('小計:')).toBe(true);
    expect(msg).toContain('指定値 999');
  });

  it('handles items[N].isReducedRate paths', () => {
    const msg = translateInvoiceWarning({
      path: 'items[0].isReducedRate',
      message: '8% は軽減税率です。isReducedRate=false の指定は無視せず明示的に確認してください。',
    });
    expect(msg).toContain('品目[1]の軽減税率フラグ');
  });
});

describe('translateInvoiceWarnings batch helper', () => {
  it('maps an array of warnings in order', () => {
    const out = translateInvoiceWarnings([
      { path: 'totals.total', message: '指定値 0 と計算値 1100 が一致しません。' },
      { path: 'issuer.name', message: 'Multiple input keys mapped to "name".' },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]).toContain('税込合計');
    expect(out[1]).toContain('発行元の名前');
  });
});
