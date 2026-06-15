---
schemaVersion: invoice/v1
invoiceNumber: INV-2026-0002
issueDate: "2026-06-30"
dueDate: "2026-07-31"
issuer:
  name: 株式会社サンプル商事
  registrationNumber: T9876543210987
  postalCode: 100-0002
  address: 東京都千代田区丸の内2-2
  tel: 03-0000-1111
  email: sales@example.com
recipient:
  name: 株式会社サンプル小売
  honorific: 御中
  postalCode: 160-0001
  address: 東京都新宿区西新宿3-3
items:
  - name: 業務用パソコン
    quantity: 2
    unit: 台
    unitPrice: 150000
    taxRate: 10
  - name: 会議用飲料（軽減税率対象）
    quantity: 24
    unit: 本
    unitPrice: 200
    taxRate: 8
    isReducedRate: true
  - name: お弁当（会議用・軽減税率対象）
    quantity: 12
    unit: 個
    unitPrice: 800
    taxRate: 8
    isReducedRate: true
taxSummary:
  standard:
    rate: 10
    subtotal: 300000
    tax: 30000
  reduced:
    rate: 8
    subtotal: 14400
    tax: 1152
  exempt:
    rate: 0
    subtotal: 0
    tax: 0
totals:
  subtotal: 314400
  tax: 31152
  total: 345552
paymentInfo:
  bankName: サンプル銀行
  branchName: 丸の内支店
  accountType: 当座
  accountNumber: "7654321"
  accountHolder: カ）サンプルショウジ
notes: |
  ※「軽減税率対象」の項目は軽減税率（8%）が適用されます。
  お振込手数料は貴社にてご負担をお願いいたします。
---

# 請求書

下記の通りご請求申し上げます。軽減税率対象品目には「※」を付しています。
