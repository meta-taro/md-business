/**
 * 文書種別（請求書 / 見積書 / 領収書）と、種別ごとの表記。
 *
 * 3 文書は 発行元・宛先・品目・税率別小計・合計・印影・テーマ・ロゴ・ファイル名が
 * 同じで、違うのは表題といくつかのラベル、それに領収書固有の 但し書き / 収入印紙欄
 * だけ。スキーマを分けると税計算・和英辞書・エラー和訳・ファイル名・PDF テンプレを
 * 3 重に持つことになり、片方だけ直る事故が起きる。よって 1 スキーマ + 種別で持つ。
 *
 * 表記をこのモジュールに集約しているのは、PDF レンダラ・デスクトップのウィンドウ
 * タイトル・Chrome 拡張のプレビューがそれぞれ独自に「請求書」を書いていて、種別を
 * 足すと 3 箇所が別々にずれるため。
 */

export type InvoiceDocumentType = '請求書' | '見積書' | '領収書';

export const INVOICE_DOCUMENT_TYPES: readonly InvoiceDocumentType[] = [
  '請求書',
  '見積書',
  '領収書',
];

export interface InvoiceDocumentLabels {
  /** 表題（PDF の見出し）。 */
  title: string;
  /**
   * 相手へ差し出す文脈で使う丁寧形（ウィンドウタイトル・保存名など）。
   * 領収書は「御領収書」と言わないので、丁寧形を機械的に作らず表で持つ。
   */
  politeTitle: string;
  /** `invoiceNumber` の見出し。 */
  numberLabel: string;
  /** `issueDate` の見出し。 */
  dateLabel: string;
  /** `dueDate` の見出し。 */
  dueLabel: string;
  /** 宛先ブロックの見出し。 */
  recipientLabel: string;
  /** 税込合計の見出し。 */
  totalLabel: string;
  /** ファイル名テンプレート未指定時の既定接頭辞。 */
  fileNamePrefix: string;
  /**
   * 免税事業者の経過措置注記を出すか。
   * 見積書は仕入税額控除の証憑にならないので出さない。
   */
  taxNotice: boolean;
  /**
   * 但し書き・収入印紙欄を出せる文書か。領収書だけ true。
   * 請求書に `但し書き` を書いても出さないのは、請求書に但し書きを刷る商習慣が
   * 無く、書き間違いを黙って印字すると受領側が用途を誤読するため。
   */
  receiptFields: boolean;
}

const LABELS: Record<InvoiceDocumentType, InvoiceDocumentLabels> = {
  請求書: {
    title: '請求書',
    politeTitle: '御請求書',
    numberLabel: '請求書番号',
    dateLabel: '発行日',
    dueLabel: '支払期限',
    recipientLabel: '請求先',
    totalLabel: 'ご請求金額（税込）',
    fileNamePrefix: '請求書',
    taxNotice: true,
    receiptFields: false,
  },
  見積書: {
    title: '見積書',
    politeTitle: '御見積書',
    numberLabel: '見積書番号',
    dateLabel: '発行日',
    dueLabel: '有効期限',
    recipientLabel: '宛先',
    totalLabel: 'お見積金額（税込）',
    fileNamePrefix: '見積書',
    taxNotice: false,
    receiptFields: false,
  },
  領収書: {
    title: '領収書',
    politeTitle: '領収書',
    numberLabel: '領収書番号',
    dateLabel: '領収日',
    dueLabel: '支払期限',
    recipientLabel: '宛先',
    totalLabel: '領収金額（税込）',
    fileNamePrefix: '領収書',
    taxNotice: true,
    receiptFields: true,
  },
};

export const INVOICE_DOCUMENT_LABELS: Readonly<Record<InvoiceDocumentType, InvoiceDocumentLabels>> =
  LABELS;

/**
 * 種別に対応する表記を返す。未指定・未知の値は請求書として扱う。
 *
 * 未知の値をここで請求書へ倒しても誤送の危険が無いのは、スキーマの enum が先に
 * 弾くため。ここは検証を通ったあとの表示側の保険。
 */
export function invoiceDocumentLabels(invoice: {
  documentType?: string;
}): InvoiceDocumentLabels {
  const type = invoice.documentType;
  if (type !== undefined && isInvoiceDocumentType(type)) {
    return LABELS[type];
  }
  return LABELS['請求書'];
}

export function isInvoiceDocumentType(value: string): value is InvoiceDocumentType {
  return (INVOICE_DOCUMENT_TYPES as readonly string[]).includes(value);
}
