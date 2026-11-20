/**
 * 原本のページの区切り（`<div class="page">p.19</div>`）で本を割るときの純関数。
 *
 * 段組みで割ると、ページの中身は窓の大きさで次のページへ流れていく。紙の教材を写した文書では
 * それが困る（「3 ページの問題は 3 ページに」ないと、原本と突き合わせられない）。
 * 区切りがある文書では区切りを 1 ページとし、はみ出す分は流さずに縮めて収める。
 */

/**
 * 原本のページを組む幅（縮める前・CSS px）。
 *
 * ページの中身は窓の幅で折り返し直さず、いつもこの幅で組んでから縮める。折り返しが変わると
 * 行の位置が動き、書き込んだ線が本文からずれる（紙は窓に合わせて組み直されない）。
 */
export const SHEET_BASE_WIDTH = 640;

/**
 * 組み幅で組んだ中身をページの枠に合わせる倍率。幅と高さのきつい方に合わせる。
 *
 * 高さに収まるページはどれも「枠の幅 ÷ 組み幅」になるので、文字の大きさが揃う。
 * はみ出すページだけがそれより小さくなる。寸法が取れないときは 1。
 */
export function sheetScale(
  baseWidth: number,
  boxWidth: number,
  contentHeight: number,
  boxHeight: number
): number {
  if (baseWidth <= 0 || boxWidth <= 0 || contentHeight <= 0 || boxHeight <= 0) return 1;
  return Math.min(boxWidth / baseWidth, boxHeight / contentHeight);
}

/** 打たれた番号を比べられる形にする（全角を半角に・大文字を小文字に・空白と「p.」を落とす）。 */
function normalize(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/^p\.?(?=\d)/, '');
}

/**
 * 「p.19」「19」などの指定から、開くページ（0 始まり）を引く。見つからなければ null。
 *
 * 区切りのある文書では原本の番号だけを見る。通し番号へ落とすと、原本に無い番号を打ったとき
 * 別のページが開き、合っているように見えてしまう。
 */
export function findPage(
  query: string,
  labels: readonly string[],
  total: number
): number | null {
  const wanted = normalize(query);
  if (wanted === '') return null;
  if (labels.length > 0) {
    const index = labels.findIndex((label) => normalize(label) === wanted);
    return index >= 0 ? index : null;
  }
  if (!/^\d+$/.test(wanted)) return null;
  const n = Number(wanted);
  return n >= 1 && n <= total ? n - 1 : null;
}

/** ページ表示（「p.18–p.19 · 12–13 / 40」）。原本の番号が無いページは通し番号だけ。 */
export function sheetLabel(
  page: number,
  perView: 1 | 2,
  labels: readonly string[]
): string {
  const total = labels.length;
  const last = Math.min(page + perView, total) - 1;
  const seq =
    last === page
      ? `${page + 1} / ${total}`
      : `${page + 1}–${last + 1} / ${total}`;
  const names = labels.slice(page, last + 1).filter((name) => name !== '');
  return names.length === 0 ? seq : `${names.join('–')} · ${seq}`;
}
