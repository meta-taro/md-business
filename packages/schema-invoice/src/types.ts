export type TaxRate = 0 | 8 | 10;
export type AccountType = '普通' | '当座' | '貯蓄';

export interface InvoiceIssuer {
  name: string;
  registrationNumber: string;
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
  invoiceNumber: string;
  issueDate: string;
  dueDate?: string;
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
