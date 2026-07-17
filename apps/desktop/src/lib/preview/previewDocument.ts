/**
 * iframe プレビュー用の完全な HTML 文書を組み立てる純関数。
 *
 * デスクトップの右ペインは、用途別ビューワー（renderer-pdf の body 断片）を
 * `<iframe srcdoc>` に隔離して描画する。iframe を使う理由:
 *   - api-spec.css などの文書 CSS を、アプリ本体のスタイルと衝突させない
 *   - 印刷（PDF 出力）時に文書だけを対象にできる
 *
 * iframe の中身は親ドキュメントとは別ツリーなので、アプリ側の
 * `:root[data-theme]` は継承されない。ライト/ダークを一致させるには、この関数が
 * iframe 内 `<html>` に `data-theme` を刻印する必要がある（api-spec.css の
 * ダーク上書きが iframe 内でも効くようにするため）。
 *
 * bodyHtml は renderer-pdf 側で値がすべて escape 済みの「断片」なので、ここでは
 * 二重エスケープしない。外から来るのは title / lang / theme のみで、これらは
 * 属性・テキストとして escape する。
 */

export type PreviewTheme = 'light' | 'dark';

export interface PreviewDocumentInput {
  /** renderer-pdf が生成した body HTML 断片（値は escape 済み）。 */
  bodyHtml: string;
  /** インライン化する文書 CSS（api-spec.css 等）のテキスト。 */
  css: string;
  /** ドキュメントタイトル（<title>）。escape される。 */
  title?: string;
  /** iframe 内 <html data-theme>。アプリのテーマと一致させる。既定 light。 */
  theme?: PreviewTheme;
  /** <html lang>。既定 'ja'。 */
  lang?: string;
}

/** 属性値・テキスト双方に使える最小 HTML エスケープ。
 *  renderer-pdf にも同等関数はあるが、このモジュール（iframe 組み立て）を
 *  依存ゼロの純ユニットに保つため、あえてローカルに小さく持つ。 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildPreviewDocument(input: PreviewDocumentInput): string {
  const { bodyHtml, css, title = '', theme = 'light', lang = 'ja' } = input;

  return `<!doctype html>
<html lang="${escapeHtml(lang)}" data-theme="${escapeHtml(theme)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${css}</style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}
