import type { Invoice } from '@md-business/schema-invoice';

export function standardInvoice(): Invoice {
  return {
    schemaVersion: 'invoice/v1',
    invoiceNumber: 'INV-2026-0001',
    issueDate: '2026-06-30',
    dueDate: '2026-07-31',
    issuer: {
      name: '株式会社サンプル発行元',
      registrationNumber: 'T1234567890123',
      postalCode: '100-0001',
      address: '東京都千代田区千代田1-1',
      tel: '03-0000-0000',
      email: 'billing@example.com',
    },
    recipient: {
      name: '株式会社サンプル受領先',
      honorific: '御中',
    },
    items: [
      {
        name: '業務委託費',
        quantity: 1,
        unit: '式',
        unitPrice: 500000,
        taxRate: 10,
      },
    ],
    taxSummary: {
      standard: { rate: 10, subtotal: 500000, tax: 50000 },
      reduced: { rate: 8, subtotal: 0, tax: 0 },
      exempt: { rate: 0, subtotal: 0, tax: 0 },
    },
    totals: { subtotal: 500000, tax: 50000, total: 550000 },
    paymentInfo: {
      bankName: 'サンプル銀行',
      branchName: '千代田支店',
      accountType: '普通',
      accountNumber: '1234567',
      accountHolder: 'カ）サンプルハッコウモト',
    },
    notes: 'お振込手数料は貴社にてご負担ください。\n複数行の備考もそのまま反映されます。',
  };
}

export function mixedRateInvoice(): Invoice {
  return {
    schemaVersion: 'invoice/v1',
    invoiceNumber: 'INV-2026-0002',
    issueDate: '2026-06-30',
    issuer: {
      name: '株式会社サンプル商事',
      registrationNumber: 'T9876543210987',
    },
    recipient: { name: '株式会社サンプル小売', honorific: '御中' },
    items: [
      { name: '業務用パソコン', quantity: 2, unit: '台', unitPrice: 150000, taxRate: 10 },
      {
        name: '会議用飲料（軽減税率対象）',
        quantity: 24,
        unit: '本',
        unitPrice: 200,
        taxRate: 8,
        isReducedRate: true,
      },
    ],
    taxSummary: {
      standard: { rate: 10, subtotal: 300000, tax: 30000 },
      reduced: { rate: 8, subtotal: 4800, tax: 384 },
      exempt: { rate: 0, subtotal: 0, tax: 0 },
    },
    totals: { subtotal: 304800, tax: 30384, total: 335184 },
  };
}

export function xssInvoice(): Invoice {
  return {
    schemaVersion: 'invoice/v1',
    invoiceNumber: '<script>alert(1)</script>',
    issueDate: '2026-06-30',
    issuer: { name: '<img src=x onerror=alert(1)>', registrationNumber: 'T0000000000000' },
    recipient: { name: '"双方の顧客"' },
    items: [{ name: '</td><td>injected', quantity: 1, unitPrice: 100, taxRate: 10 }],
    taxSummary: {
      standard: { rate: 10, subtotal: 100, tax: 10 },
      reduced: { rate: 8, subtotal: 0, tax: 0 },
      exempt: { rate: 0, subtotal: 0, tax: 0 },
    },
    totals: { subtotal: 100, tax: 10, total: 110 },
  };
}
