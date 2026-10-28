// 描画は Chrome 拡張のものをそのまま使う。移植すると、同じ文書が道具ごとに違って見え始める。
// Chrome 拡張は公開パッケージではないので、ソースを相対パスで読む（同梱はバンドル時）。
import { previewMarkdown } from '../../../chrome-extension/src/shared/loadMarkdown.js';

const STYLE_MARKER = 'data-md-business';

function useStylesheet(href: string): void {
  const doc = document;
  let link = doc.querySelector<HTMLLinkElement>(`link[${STYLE_MARKER}]`);
  if (!link) {
    link = doc.createElement('link');
    link.rel = 'stylesheet';
    link.setAttribute(STYLE_MARKER, '');
    doc.head.appendChild(link);
  }
  if (link.getAttribute('href') !== href) link.setAttribute('href', href);
}

function notice(lines: string[]): HTMLElement {
  const box = document.createElement('aside');
  box.className = 'mdb-notice';
  for (const line of lines) {
    const p = document.createElement('p');
    // 文言には文書の値が混ざる。HTML として解釈させない。
    p.textContent = line;
    box.appendChild(p);
  }
  return box;
}

/**
 * 文書全体を描き直す。誤りがあっても描ける分は描き、直すべき点を上に並べる。
 * 書いている途中の文書を見るための画面なので、赤線のたびに真っ白にはしない。
 */
export function renderPreview(root: HTMLElement, text: string, stylesBase: string): void {
  const result = previewMarkdown(text);
  root.replaceChildren();

  if (!result.ok) {
    root.appendChild(notice([result.reason, ...(result.details ?? [])]));
    return;
  }

  useStylesheet(`${stylesBase}${result.stylesHref}`);
  const problems = [
    ...(result.fatal ? [result.fatal] : []),
    ...result.errors.map((e) => e.message),
    ...result.warnings,
  ];
  if (problems.length > 0) root.appendChild(notice(problems));

  const body = document.createElement('div');
  body.className = 'mdb-body';
  // 各種別の描画が sanitize 済み・エスケープ済みの HTML を返す。
  body.innerHTML = result.bodyHtml;
  root.appendChild(body);
}
