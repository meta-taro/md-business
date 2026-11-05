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

/** 置く側（Rust の safe_file_stem）が断る名前。断られると PDF ごと作れなくなる。 */
const FORBIDDEN = /[<>:"|?*/\\\u0000-\u001f]/;
const DEVICE_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
const MAX_STEM_CHARS = 100;

/**
 * 直接作るときに置く名前。印刷の画面と同じ名前にする。
 *
 * タイトルは人が自由に書くので、区切り文字などファイル名にできない字を含むことがある。
 * そのときは書き換えずに名前を渡さず、元の文書と同じ名前で置かせる
 * （書き換えると、なぜその名前になったのかが分からない）。
 */
export function directPdfName(preview: { pdfFileName?: string; documentTitle: string }): string | null {
  const name = pdfSaveName(preview);
  if (name === '' || [...name].length > MAX_STEM_CHARS) return null;
  if (FORBIDDEN.test(name) || name.endsWith('.')) return null;
  if (DEVICE_NAMES.test(name.split('.')[0])) return null;
  return name;
}

/** 裏の WebView2 で PDF を作れるのは Windows だけ（作る側が WebView2 の口を使うため）。 */
export function canPrintDirectly(userAgent: string): boolean {
  return userAgent.includes('Windows');
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
