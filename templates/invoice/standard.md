---
schemaVersion: invoice/v1
invoiceNumber: INV-2026-0001
issueDate: "2026-06-30"
dueDate: "2026-07-31"
issuer:
  name: 株式会社サンプル発行元
  registrationNumber: T1234567890123
  postalCode: 100-0001
  address: 東京都千代田区千代田1-1
  tel: 03-0000-0000
  email: billing@example.com
recipient:
  name: 株式会社サンプル受領先
  honorific: 御中
  postalCode: 150-0001
  address: 東京都渋谷区神宮前1-1
items:
  - name: 業務委託費（2026 年 6 月分）
    quantity: 1
    unit: 式
    unitPrice: 500000
    taxRate: 10
taxSummary:
  standard:
    rate: 10
    subtotal: 500000
    tax: 50000
  reduced:
    rate: 8
    subtotal: 0
    tax: 0
  exempt:
    rate: 0
    subtotal: 0
    tax: 0
totals:
  subtotal: 500000
  tax: 50000
  total: 550000
paymentInfo:
  bankName: サンプル銀行
  branchName: 千代田支店
  accountType: 普通
  accountNumber: "1234567"
  accountHolder: カ）サンプルハッコウモト
notes: お振込手数料は貴社にてご負担をお願いいたします。
stamp:
  shape: auto
---

# 請求書

下記の通りご請求申し上げます。
