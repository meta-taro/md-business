/**
 * 更新ダイアログに出すリリースノートの整形。
 *
 * ノートは Markdown で書かれているため、素のまま出すと `##` や `-` が本文に混ざったまま
 * 利用者に見える。プレビューと同じ経路（core の MD→HTML + sanitizeViewerHtml）で描く。
 *
 * ただしプレビューと違い、この HTML は iframe ではなくアプリ本体の文書へ直接差し込む。
 * 隔離が効かないぶん、
 *   - 図（inline svg）は許さない。リリースノートに要らないうえ、面が広がるだけ。
 *   - リンクは押しても遷移させない（webview ごとアプリの外へ飛んでしまう）。
 *     行き先だけ取り出して、既定のブラウザへ渡す。
 * の 2 点を狭めている。ノート本文は配信元の JSON から来る文字列で、署名が守るのは
 * 配布物のほうなので、中身は信用しない前提で扱う。
 */
import { renderMarkdownToHtml } from '@md-business/core';
import { sanitizeViewerHtml } from '../preview/sanitizeHtml';
import type { Locale } from '../i18n/locales';

/** 配信元の本文で、日本語と英語を分けている目印（Markdown のコメント＝画面には出ない）。 */
const LOCALE_MARKER = '<!-- lang:en -->';

/**
 * 配信元の本文から、表示言語で読めるぶんを取り出す。
 *
 * Release の本文は 1 つしか持てないので、日本語と英語を目印で続けて入れてある。
 * 目印が無い本文（それを入れる前に出した版）は、丸ごと返す。消してしまうより読めたほうがよい。
 */
export function pickReleaseNotes(notes: string, locale: Locale): string {
  const at = notes.indexOf(LOCALE_MARKER);
  if (at === -1) return notes.trim();
  return (locale === 'ja' ? notes.slice(0, at) : notes.slice(at + LOCALE_MARKER.length)).trim();
}

/** リリースノート（Markdown）を、そのまま差し込める HTML にする。空なら空文字。 */
export function renderReleaseNotes(notes: string): string {
  if (notes.trim().length === 0) return '';
  return sanitizeViewerHtml(renderMarkdownToHtml(notes, { hasFrontmatter: false }), {
    allowSvg: false,
  });
}

/**
 * 押された要素から、外部ブラウザで開くべき行き先を取り出す。リンク外なら null。
 *
 * 押されるのは <a> 自身とは限らない（`[`v0.6.0`](...)` のように包まれている）ため、
 * 祖先をたどる。行き先は web に限る。既定のアプリへ渡す経路なので、file: 等を
 * そのまま流すと本文しだいで任意の場所を開かせられる。
 */
export function externalLinkHref(target: EventTarget | null): string | null {
  if (!(target instanceof Element)) return null;
  const anchor = target.closest('a');
  const href = anchor?.getAttribute('href') ?? '';
  return /^https?:\/\//i.test(href) ? href : null;
}
