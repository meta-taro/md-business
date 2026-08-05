import type { InvoiceDocumentType } from './documentType.js';

export type TaxRate = 0 | 8 | 10;
export type AccountType = '普通' | '当座' | '貯蓄';

export interface InvoiceIssuer {
  name: string;
  /**
   * 適格請求書発行事業者の登録番号 (T + 13 桁)。
   * 免税事業者の請求書では省略可。省略時は `taxExemptIssuer: true` を指定すること推奨。
   */
  registrationNumber?: string;
  /**
   * 免税事業者フラグ。true の場合は適格請求書発行事業者の登録を受けていない発行元として扱う。
   * renderer はヘッダに「適格請求書ではありません」の注記と経過措置案内を出力する。
   */
  taxExemptIssuer?: boolean;
  postalCode?: string;
  address?: string;
  tel?: string;
  email?: string;
}

export interface InvoiceRecipient {
  name: string;
  honorific?: string;
  postalCode?: string;
  address?: string;
}

export interface InvoiceItem {
  name: string;
  quantity: number;
  unit?: string;
  unitPrice: number;
  taxRate: TaxRate;
  isReducedRate?: boolean;
  note?: string;
}

export interface InvoiceTaxBucket {
  rate: TaxRate;
  subtotal: number;
  tax: number;
}

export interface InvoiceTaxSummary {
  standard: InvoiceTaxBucket;
  reduced: InvoiceTaxBucket;
  exempt: InvoiceTaxBucket;
}

export interface InvoiceTotals {
  subtotal: number;
  tax: number;
  total: number;
}

export interface InvoicePaymentInfo {
  bankName?: string;
  branchName?: string;
  accountType?: AccountType;
  accountNumber?: string;
  accountHolder?: string;
}

export type StampShape = 'auto' | 'round' | 'square' | 'off';

export interface InvoiceStamp {
  enabled?: boolean;
  shape?: StampShape;
  text?: string;
  font?: string;
}

export interface Invoice {
  schemaVersion: 'invoice/v1';
  /**
   * 文書種別。省略時は請求書。
   * 3 文書は構造が同じで表記だけが違うため、スキーマを分けず種別で持つ。
   */
  documentType?: InvoiceDocumentType;
  invoiceNumber: string;
  issueDate: string;
  dueDate?: string;
  /**
   * 但し書き（領収書）。「但し」に続けて表示するため、値には用途だけを書く
   * （例: `システム開発費用として`）。
   */
  subject?: string;
  /**
   * 収入印紙欄を出すか（領収書・既定は出さない）。
   * 電子交付の領収書に印紙税はかからないので、紙で渡す発行元だけが立てる。
   */
  revenueStamp?: boolean;
  issuer: InvoiceIssuer;
  recipient: InvoiceRecipient;
  items: InvoiceItem[];
  taxSummary: InvoiceTaxSummary;
  totals: InvoiceTotals;
  paymentInfo?: InvoicePaymentInfo;
  notes?: string;
  stamp?: InvoiceStamp;
  /**
   * Optional template for the PDF save filename. Substituted at viewer-side
   * render time — see `renderInvoiceFileName` for the token vocabulary.
   * Authors set this once per company; AI-generated invoices inherit it
   * via the company's template.
   */
  fileName?: string;
  /**
   * Accent color preset name (blue / red / yellow / orange / purple / black /
   * gray) or an explicit `#rrggbb` hex. Unknown values fall back to the
   * default blue at render time.
   */
  theme?: string;
  /**
   * Company logo. Accepts `data:image/{png,jpeg,gif,webp};base64,...` and
   * `https://...` URLs. Other schemes (including svg+xml) are rejected at
   * render time for safety.
   */
  logo?: string;
}
