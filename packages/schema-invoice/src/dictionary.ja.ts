/**
 * Japanese → English key dictionary for invoice frontmatter.
 *
 * Authors write Markdown frontmatter in Japanese (the natural authoring
 * language for 適格請求書), and {@link normalizeInvoiceFrontmatter} maps
 * keys to the canonical English shape that {@link invoiceSchema} validates.
 *
 * Each scope has ONE canonical translation per English key plus optional
 * aliases. When two source keys (e.g. `名前` and `名称`) resolve to the
 * same target, the normalizer warns so authors can converge on one term.
 *
 * Synonyms intentionally cover common business-Japanese variations:
 *   名前 / 名称 / 商号 / 氏名
 *   合計 / 総額 / 総合計
 *   電話 / TEL / Tel
 * — picking a winner here keeps schemas authorable for both humans and AI
 * without forcing a single rigid term on every team.
 */

export type DictionaryScope = 'root' | 'party' | 'item' | 'payment' | 'stamp' | 'taxBucket';

export type Dictionary = Record<DictionaryScope, Record<string, string>>;

export const INVOICE_JA_DICTIONARY: Dictionary = {
  root: {
    スキーマ: 'schemaVersion',
    schemaVersion: 'schemaVersion',
    請求書番号: 'invoiceNumber',
    invoiceNumber: 'invoiceNumber',
    番号: 'invoiceNumber',
    発行日: 'issueDate',
    issueDate: 'issueDate',
    発行年月日: 'issueDate',
    請求日: 'issueDate',
    支払期限: 'dueDate',
    dueDate: 'dueDate',
    支払い期限: 'dueDate',
    お支払期限: 'dueDate',
    発行元: 'issuer',
    issuer: 'issuer',
    請求元: 'issuer',
    請求先: 'recipient',
    recipient: 'recipient',
    宛先: 'recipient',
    品目: 'items',
    items: 'items',
    明細: 'items',
    内訳: 'items',
    税率別小計: 'taxSummary',
    taxSummary: 'taxSummary',
    税区分: 'taxSummary',
    合計: 'totals',
    totals: 'totals',
    総計: 'totals',
    総額: 'totals',
    振込先: 'paymentInfo',
    paymentInfo: 'paymentInfo',
    お振込先: 'paymentInfo',
    お振込み先: 'paymentInfo',
    備考: 'notes',
    notes: 'notes',
    メモ: 'notes',
    印影: 'stamp',
    stamp: 'stamp',
    印鑑: 'stamp',
    ハンコ: 'stamp',
    丸め: 'taxRounding',
    taxRounding: 'taxRounding',
    端数処理: 'taxRounding',
    税端数処理: 'taxRounding',
    ファイル名: 'fileName',
    fileName: 'fileName',
    保存名: 'fileName',
    テーマ: 'theme',
    theme: 'theme',
    テーマカラー: 'theme',
    カラー: 'theme',
    色: 'theme',
    ロゴ: 'logo',
    logo: 'logo',
    ロゴ画像: 'logo',
  },
  party: {
    名前: 'name',
    name: 'name',
    名称: 'name',
    商号: 'name',
    氏名: 'name',
    会社名: 'name',
    敬称: 'honorific',
    honorific: 'honorific',
    登録番号: 'registrationNumber',
    registrationNumber: 'registrationNumber',
    インボイス番号: 'registrationNumber',
    免税事業者: 'taxExemptIssuer',
    taxExemptIssuer: 'taxExemptIssuer',
    免税: 'taxExemptIssuer',
    非適格: 'taxExemptIssuer',
    インボイス未登録: 'taxExemptIssuer',
    郵便番号: 'postalCode',
    postalCode: 'postalCode',
    住所: 'address',
    address: 'address',
    電話: 'tel',
    tel: 'tel',
    TEL: 'tel',
    Tel: 'tel',
    電話番号: 'tel',
    メール: 'email',
    email: 'email',
    Email: 'email',
    EMAIL: 'email',
    'メールアドレス': 'email',
  },
  item: {
    名前: 'name',
    name: 'name',
    名称: 'name',
    品名: 'name',
    品目名: 'name',
    数量: 'quantity',
    quantity: 'quantity',
    単位: 'unit',
    unit: 'unit',
    単価: 'unitPrice',
    unitPrice: 'unitPrice',
    価格: 'unitPrice',
    税率: 'taxRate',
    taxRate: 'taxRate',
    軽減税率: 'isReducedRate',
    isReducedRate: 'isReducedRate',
    軽減: 'isReducedRate',
    備考: 'note',
    note: 'note',
    メモ: 'note',
  },
  payment: {
    銀行: 'bankName',
    bankName: 'bankName',
    銀行名: 'bankName',
    支店: 'branchName',
    branchName: 'branchName',
    支店名: 'branchName',
    種別: 'accountType',
    accountType: 'accountType',
    口座種別: 'accountType',
    口座番号: 'accountNumber',
    accountNumber: 'accountNumber',
    名義: 'accountHolder',
    accountHolder: 'accountHolder',
    口座名義: 'accountHolder',
  },
  stamp: {
    有効: 'enabled',
    enabled: 'enabled',
    表示: 'enabled',
    形: 'shape',
    shape: 'shape',
    形状: 'shape',
    形式: 'shape',
    文字: 'text',
    text: 'text',
    印字: 'text',
    フォント: 'font',
    font: 'font',
    書体: 'font',
  },
  taxBucket: {
    税率: 'rate',
    rate: 'rate',
    小計: 'subtotal',
    subtotal: 'subtotal',
    消費税: 'tax',
    tax: 'tax',
    税額: 'tax',
  },
};

/**
 * Translate tax-rounding values written in Japanese to canonical English.
 * Anything not in this map is passed through verbatim — the schema validator
 * then rejects unrecognized values.
 */
export const TAX_ROUNDING_TRANSLATIONS: Record<string, string> = {
  切り捨て: 'floor',
  切捨て: 'floor',
  きりすて: 'floor',
  floor: 'floor',
  四捨五入: 'round',
  ししゃごにゅう: 'round',
  round: 'round',
  切り上げ: 'ceil',
  切上げ: 'ceil',
  きりあげ: 'ceil',
  ceil: 'ceil',
};

/**
 * Translate account-type values. Source schema enum is Japanese-only,
 * so this is a no-op for the canonical values but normalizes English aliases.
 */
/**
 * Translate theme color values written in Japanese to canonical English
 * preset names. Hex codes (e.g. `#2a4d7a`) are passed through verbatim;
 * unknown strings are also passed through and silently ignored by the
 * renderer.
 */
export const THEME_VALUE_TRANSLATIONS: Record<string, string> = {
  青: 'blue',
  ブルー: 'blue',
  blue: 'blue',
  赤: 'red',
  レッド: 'red',
  red: 'red',
  黄: 'yellow',
  黄色: 'yellow',
  イエロー: 'yellow',
  yellow: 'yellow',
  橙: 'orange',
  オレンジ: 'orange',
  orange: 'orange',
  紫: 'purple',
  パープル: 'purple',
  purple: 'purple',
  黒: 'black',
  ブラック: 'black',
  black: 'black',
  灰: 'gray',
  灰色: 'gray',
  グレー: 'gray',
  グレイ: 'gray',
  gray: 'gray',
  grey: 'gray',
};

export const ACCOUNT_TYPE_TRANSLATIONS: Record<string, string> = {
  普通: '普通',
  当座: '当座',
  貯蓄: '貯蓄',
  saving: '普通',
  savings: '普通',
  checking: '当座',
  current: '当座',
};
