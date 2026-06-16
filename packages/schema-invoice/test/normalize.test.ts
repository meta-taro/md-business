import { describe, it, expect } from 'vitest';
import { normalizeInvoiceFrontmatter } from '../src/normalize.js';

describe('normalizeInvoiceFrontmatter', () => {
  it('translates root-level Japanese keys to English', () => {
    const input = {
      請求書番号: 'INV-1',
      発行日: '2026-06-30',
      支払期限: '2026-07-31',
      備考: 'メモ',
    };
    const { data } = normalizeInvoiceFrontmatter(input);
    expect(data['invoiceNumber']).toBe('INV-1');
    expect(data['issueDate']).toBe('2026-06-30');
    expect(data['dueDate']).toBe('2026-07-31');
    expect(data['notes']).toBe('メモ');
  });

  it('translates issuer / recipient party keys including aliases', () => {
    const input = {
      発行元: { 名称: '株式会社A', 登録番号: 'T1234567890123', 電話: '03-1111-2222' },
      請求先: { 商号: '株式会社B', 敬称: '御中' },
    };
    const { data } = normalizeInvoiceFrontmatter(input);
    const issuer = data['issuer'] as Record<string, unknown>;
    const recipient = data['recipient'] as Record<string, unknown>;
    expect(issuer['name']).toBe('株式会社A');
    expect(issuer['registrationNumber']).toBe('T1234567890123');
    expect(issuer['tel']).toBe('03-1111-2222');
    expect(recipient['name']).toBe('株式会社B');
    expect(recipient['honorific']).toBe('御中');
  });

  it('translates items[] keys per-element', () => {
    const input = {
      品目: [
        { 品名: 'コンサル', 数量: 2, 単価: 50000, 税率: 10 },
        { 名前: '飲料', 数量: 10, 単価: 200, 税率: 8 },
      ],
    };
    const { data } = normalizeInvoiceFrontmatter(input);
    const items = data['items'] as Array<Record<string, unknown>>;
    expect(items[0]?.['name']).toBe('コンサル');
    expect(items[0]?.['unitPrice']).toBe(50000);
    expect(items[1]?.['name']).toBe('飲料');
    expect(items[1]?.['taxRate']).toBe(8);
  });

  it('translates payment, stamp, taxRounding directives', () => {
    const input = {
      振込先: { 銀行: 'A銀行', 支店: 'B支店', 種別: '普通', 口座番号: '111', 名義: 'カナ' },
      印影: { 形: 'square', 文字: '代表' },
      丸め: '切り捨て',
    };
    const { data } = normalizeInvoiceFrontmatter(input);
    expect(data['paymentInfo']).toEqual({
      bankName: 'A銀行',
      branchName: 'B支店',
      accountType: '普通',
      accountNumber: '111',
      accountHolder: 'カナ',
    });
    expect(data['stamp']).toEqual({ shape: 'square', text: '代表' });
    expect(data['taxRounding']).toBe('floor');
  });

  it('warns when two source keys collide on the same target', () => {
    const input = { 名前: 'a', name: 'b' };
    const { warnings } = normalizeInvoiceFrontmatter({ 発行元: input });
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]?.message).toMatch(/Multiple input keys/);
  });

  it('returns empty data for non-object input', () => {
    const { data, warnings } = normalizeInvoiceFrontmatter(null);
    expect(data).toEqual({});
    expect(warnings).toEqual([]);
  });

  it('translates account-type English aliases to canonical Japanese', () => {
    const input = { 振込先: { 種別: 'savings' } };
    const { data } = normalizeInvoiceFrontmatter(input);
    expect((data['paymentInfo'] as Record<string, unknown>)['accountType']).toBe('普通');
  });

  it('passes unknown taxRounding strings through (schema rejects them)', () => {
    const { data } = normalizeInvoiceFrontmatter({ 丸め: 'banker' });
    expect(data['taxRounding']).toBe('banker');
  });

  it('translates theme color names from Japanese to English presets', () => {
    expect(normalizeInvoiceFrontmatter({ テーマ: '赤' }).data['theme']).toBe('red');
    expect(normalizeInvoiceFrontmatter({ テーマカラー: '青' }).data['theme']).toBe('blue');
    expect(normalizeInvoiceFrontmatter({ カラー: 'オレンジ' }).data['theme']).toBe('orange');
    expect(normalizeInvoiceFrontmatter({ 色: 'グレー' }).data['theme']).toBe('gray');
  });

  it('passes hex theme values through verbatim (renderer validates them)', () => {
    expect(normalizeInvoiceFrontmatter({ テーマ: '#2a4d7a' }).data['theme']).toBe('#2a4d7a');
  });

  it('accepts the logo key as a top-level passthrough', () => {
    const dataUrl = 'data:image/png;base64,iVBORw0KGgo=';
    expect(normalizeInvoiceFrontmatter({ ロゴ: dataUrl }).data['logo']).toBe(dataUrl);
  });

  it('passes English-only frontmatter through unchanged (backwards compat)', () => {
    const input = {
      invoiceNumber: 'INV-1',
      issueDate: '2026-06-30',
      issuer: { name: 'X', registrationNumber: 'T1234567890123' },
      recipient: { name: 'Y' },
      items: [{ name: 'item', quantity: 1, unitPrice: 1000, taxRate: 10 }],
    };
    const { data, warnings } = normalizeInvoiceFrontmatter(input);
    expect(warnings).toEqual([]);
    expect(data).toEqual(input);
  });
});
