import { describe, it, expect } from 'vitest';
import validate from '../dist/validate.compiled.js';
import { parseInvoiceObject } from '../src/parseInvoice.js';
import { invoiceDocumentLabels } from '../src/documentType.js';
import { renderInvoiceFileName } from '../src/fileName.js';

/**
 * 文書種別（請求書 / 見積書 / 領収書）。
 *
 * 3 文書は 発行元・宛先・品目・税率別小計・合計・印影 が同じで、違うのは表題と
 * いくつかのラベル、それに領収書固有の 但し書き / 収入印紙欄 だけ。スキーマを
 * 分けると税計算・和英辞書・エラー和訳・ファイル名・PDF テンプレを 3 重に持つ
 * ことになり、片方だけ直る事故が起きる。よって 1 スキーマ + 種別フィールドで持つ。
 *
 * 種別は任意。書かなければ請求書として扱う（＝既存ファイルの出力が変わらない）。
 */

function jaBase(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    スキーマ: 'invoice/v1',
    請求書番号: 'INV-2026-0001',
    発行日: '2026-08-04',
    発行元: { 名前: '株式会社サンプル発行元', 登録番号: 'T1234567890123' },
    請求先: { 名前: '株式会社サンプル受領先', 敬称: '御中' },
    品目: [{ 名前: '開発費', 数量: 1, 単価: 100000, 税率: 10 }],
    ...extra,
  };
}

function parse(raw: Record<string, unknown>) {
  const result = parseInvoiceObject(raw, validate);
  if (!result.ok) {
    throw new Error(`検証に失敗: ${JSON.stringify(result.errors)}`);
  }
  return result.invoice;
}

describe('種別 — 文書種別フィールド', () => {
  it('種別を書かなければ請求書として扱う', () => {
    const invoice = parse(jaBase());
    expect(invoice.documentType).toBeUndefined();
    expect(invoiceDocumentLabels(invoice).title).toBe('請求書');
  });

  it('種別: 見積書 を受け付ける', () => {
    const invoice = parse(jaBase({ 種別: '見積書' }));
    expect(invoice.documentType).toBe('見積書');
  });

  it('種別: 領収書 を受け付ける', () => {
    const invoice = parse(jaBase({ 種別: '領収書' }));
    expect(invoice.documentType).toBe('領収書');
  });

  it('英語表記も受け付ける（quote / receipt / invoice）', () => {
    expect(parse(jaBase({ documentType: 'quote' })).documentType).toBe('見積書');
    expect(parse(jaBase({ documentType: 'receipt' })).documentType).toBe('領収書');
    expect(parse(jaBase({ documentType: 'invoice' })).documentType).toBe('請求書');
  });

  it('知らない種別は検証で弾く', () => {
    // 誤字を黙って請求書に倒すと、見積のつもりで請求書を送る事故になる。
    const result = parseInvoiceObject(jaBase({ 種別: '納品書' }), validate);
    expect(result.ok).toBe(false);
  });
});

describe('領収書の固有項目', () => {
  it('但し書きと収入印紙欄を持てる', () => {
    const invoice = parse(
      jaBase({ 種別: '領収書', 但し書き: 'システム開発費用として', 収入印紙: true }),
    );
    expect(invoice.subject).toBe('システム開発費用として');
    expect(invoice.revenueStamp).toBe(true);
  });

  it('収入印紙欄は既定で出さない', () => {
    // 電子交付の領収書に印紙税はかからない。既定で欄を出すと、要らない印紙を
    // 貼る運用へ誘導してしまうので、紙で渡す人だけが明示的に立てる。
    const invoice = parse(jaBase({ 種別: '領収書' }));
    expect(invoice.revenueStamp).toBeUndefined();
  });
});

describe('invoiceDocumentLabels', () => {
  it('請求書のラベル', () => {
    const labels = invoiceDocumentLabels({});
    expect(labels.title).toBe('請求書');
    expect(labels.numberLabel).toBe('請求書番号');
    expect(labels.dateLabel).toBe('発行日');
    expect(labels.dueLabel).toBe('支払期限');
    expect(labels.recipientLabel).toBe('請求先');
    expect(labels.totalLabel).toBe('ご請求金額（税込）');
    expect(labels.taxNotice).toBe(true);
  });

  it('見積書のラベル', () => {
    const labels = invoiceDocumentLabels({ documentType: '見積書' });
    expect(labels.title).toBe('見積書');
    expect(labels.numberLabel).toBe('見積書番号');
    expect(labels.dueLabel).toBe('有効期限');
    expect(labels.recipientLabel).toBe('宛先');
    expect(labels.totalLabel).toBe('お見積金額（税込）');
  });

  it('見積書は仕入税額控除の証憑にならないので経過措置の注記を出さない', () => {
    expect(invoiceDocumentLabels({ documentType: '見積書' }).taxNotice).toBe(false);
  });

  it('領収書のラベル', () => {
    const labels = invoiceDocumentLabels({ documentType: '領収書' });
    expect(labels.title).toBe('領収書');
    expect(labels.numberLabel).toBe('領収書番号');
    expect(labels.dateLabel).toBe('領収日');
    expect(labels.totalLabel).toBe('領収金額（税込）');
    expect(labels.taxNotice).toBe(true);
  });
});

describe('renderInvoiceFileName — 既定名は種別に追随する', () => {
  it('種別なしは従来どおり 請求書_{番号}', () => {
    const invoice = parse(jaBase());
    expect(renderInvoiceFileName(invoice)).toBe('請求書_INV-2026-0001');
  });

  it('見積書は 見積書_{番号}', () => {
    const invoice = parse(jaBase({ 種別: '見積書', 請求書番号: 'EST-2026-0001' }));
    expect(renderInvoiceFileName(invoice)).toBe('見積書_EST-2026-0001');
  });

  it('ファイル名テンプレートを書いていればそちらが勝つ', () => {
    const invoice = parse(jaBase({ 種別: '領収書' }));
    expect(renderInvoiceFileName(invoice, '{請求先}_{番号}')).toBe('株式会社サンプル受領先_INV-2026-0001');
  });
});
