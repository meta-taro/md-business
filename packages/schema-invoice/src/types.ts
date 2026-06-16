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
}
