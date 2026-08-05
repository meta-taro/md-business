import { describe, it, expect } from 'vitest';
import type { Invoice } from '@md-business/schema-invoice';
import { renderInvoiceBody } from '../src/template.js';
import { renderInvoiceHtml } from '../src/renderHtml.js';
import { standardInvoice, taxExemptInvoice } from './fixtures.js';

/**
 * 文書種別（請求書 / 見積書 / 領収書）ごとの表記。
 *
 * 3 文書は構造が同じで、違うのは表題・番号 / 日付 / 期限 / 合計のラベル、それに
 * 領収書固有の 但し書き / 収入印紙欄 だけ。表記は schema-invoice の
 * `invoiceDocumentLabels` が正本で、ここはそれが実際に出ているかを見る。
 *
 * 中止条件: 種別を書いていない請求書の出力が 1 文字でも変わったら設計を見直す。
 */

function quotation(): Invoice {
  return { ...standardInvoice(), documentType: '見積書' };
}

function receipt(overrides: Partial<Invoice> = {}): Invoice {
  const { dueDate: _dueDate, ...rest } = standardInvoice();
  return { ...rest, documentType: '領収書', ...overrides };
}

describe('種別なし = 請求書（既存ファイルの出力を変えない）', () => {
  it('種別を足していない請求書と、種別: 請求書 を書いた請求書は同じ出力', () => {
    const withoutType = renderInvoiceBody(standardInvoice());
    const withType = renderInvoiceBody({ ...standardInvoice(), documentType: '請求書' });
    expect(withType).toBe(withoutType);
  });

  it('見出し・ラベルは従来どおり', () => {
    const html = renderInvoiceBody(standardInvoice());
    expect(html).toContain('<h1 class="mdb-invoice__title">請求書</h1>');
    expect(html).toContain('<dt>請求書番号</dt>');
    expect(html).toContain('<dt>発行日</dt>');
    expect(html).toContain('<dt>支払期限</dt>');
    expect(html).toContain('ご請求金額（税込）');
    expect(html).toContain('<h2>請求先</h2>');
  });
});

describe('見積書', () => {
  const html = renderInvoiceBody(quotation());

  it('表題が見積書', () => {
    expect(html).toContain('<h1 class="mdb-invoice__title">見積書</h1>');
    expect(html).not.toContain('<h1 class="mdb-invoice__title">請求書</h1>');
  });

  it('番号・期限・合計・宛先のラベルが見積書のもの', () => {
    expect(html).toContain('<dt>見積書番号</dt>');
    expect(html).toContain('<dt>有効期限</dt>');
    expect(html).toContain('お見積金額（税込）');
    expect(html).toContain('<h2>宛先</h2>');
  });

  it('種別を data 属性に出す（スタイル・自動処理の取っ掛かり）', () => {
    expect(html).toContain('data-document-type="見積書"');
  });

  it('免税事業者でも経過措置の注記は出さない', () => {
    // 見積書は仕入税額控除の証憑にならないので、経過措置の案内をする場面がない。
    const html = renderInvoiceBody({ ...taxExemptInvoice(), documentType: '見積書' });
    expect(html).not.toContain('経過措置');
  });
});

describe('領収書', () => {
  const html = renderInvoiceBody(receipt());

  it('表題とラベルが領収書のもの', () => {
    expect(html).toContain('<h1 class="mdb-invoice__title">領収書</h1>');
    expect(html).toContain('<dt>領収書番号</dt>');
    expect(html).toContain('<dt>領収日</dt>');
    expect(html).toContain('領収金額（税込）');
  });

  it('但し書きを金額の下に出す', () => {
    const withSubject = renderInvoiceBody(receipt({ subject: 'システム開発費用として' }));
    expect(withSubject).toContain('但し システム開発費用として');
  });

  it('但し書きが無ければ何も出さない', () => {
    expect(html).not.toContain('但し');
  });

  it('但し書きをエスケープする', () => {
    const evil = renderInvoiceBody(receipt({ subject: '<script>alert(1)</script>' }));
    expect(evil).not.toContain('<script>alert(1)</script>');
    expect(evil).toContain('&lt;script&gt;');
  });

  it('収入印紙欄は明示したときだけ出す', () => {
    expect(html).not.toContain('収入印紙');
    expect(renderInvoiceBody(receipt({ revenueStamp: true }))).toContain('収入印紙');
  });

  it('免税事業者の経過措置注記は文書名に合わせる', () => {
    const exempt = renderInvoiceBody({ ...taxExemptInvoice(), documentType: '領収書' });
    expect(exempt).toContain('本領収書は適格請求書発行事業者以外が発行したものです');
  });
});

describe('収入印紙欄は領収書だけ', () => {
  it('請求書で立てても出さない', () => {
    const html = renderInvoiceBody({ ...standardInvoice(), revenueStamp: true });
    expect(html).not.toContain('収入印紙');
  });

  it('但し書きも領収書だけ', () => {
    const html = renderInvoiceBody({ ...standardInvoice(), subject: '開発費として' });
    expect(html).not.toContain('但し 開発費として');
  });
});

describe('renderInvoiceHtml — <title>', () => {
  it('種別なしは従来どおり 請求書', () => {
    expect(renderInvoiceHtml(standardInvoice())).toContain('<title>請求書 INV-2026-0001</title>');
  });

  it('見積書は見積書', () => {
    expect(renderInvoiceHtml(quotation())).toContain('<title>見積書 INV-2026-0001</title>');
  });

  it('documentTitle の指定が勝つ', () => {
    const html = renderInvoiceHtml(quotation(), { documentTitle: '任意のタイトル' });
    expect(html).toContain('<title>任意のタイトル</title>');
  });
});
