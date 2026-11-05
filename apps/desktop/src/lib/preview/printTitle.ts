/**
 * PDF の保存名を印刷ダイアログへ渡す（DOM を直接持たない薄い関数）。
 *
 * WebView の「PDF として保存」は、印刷した iframe ではなくアプリの外枠の題名を
 * 既定の保存名にする。そのため印刷のあいだだけ外枠の題名を文書の保存名へ差し替え、
 * 印刷が終わったら戻す。
 */

/** 題名を持つもの（実体は `document`）。 */
export interface TitleHost {
  title: string;
}

/** 印刷するもの（実体はプレビュー iframe の `contentWindow`）。 */
export interface PrintFrame {
  focus(): void;
  print(): void;
  addEventListener(type: 'afterprint', listener: () => void, options?: { once?: boolean }): void;
}

/** 保存名。スキーマが fileName から作った名前を先に使い、無ければ文書タイトル。 */
export function pdfSaveName(preview: { pdfFileName?: string; documentTitle: string }): string {
  const named = preview.pdfFileName?.trim();
  return named ? named : preview.documentTitle.trim();
}

export function printWithTitle(host: TitleHost, frame: PrintFrame, name: string): void {
  if (name !== '') {
    const previous = host.title;
    host.title = name;
    frame.addEventListener('afterprint', () => (host.title = previous), { once: true });
  }
  frame.focus();
  frame.print();
}
