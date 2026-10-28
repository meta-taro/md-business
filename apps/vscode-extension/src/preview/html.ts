import { randomBytes } from 'node:crypto';

export interface PreviewHtmlOptions {
  /** webview.cspSource。拡張が配る CSS を読む許可に使う。 */
  cspSource: string;
  nonce: string;
  scriptUri: string;
  /** 文書種別ごとの CSS（styles/<種別>.css）を解決する起点。末尾は `/`。 */
  stylesBaseUri: string;
}

const ALPHANUMERIC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export function createNonce(): string {
  return Array.from(randomBytes(32), (byte) => ALPHANUMERIC[byte % ALPHANUMERIC.length]).join('');
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * プレビュー用 webview の外枠。描画は中で動くスクリプトが行う。
 *
 * 文書は手元の Markdown なので信頼できるとは限らない。スクリプトは nonce の付いた
 * 拡張のものだけを通し、文書に紛れた script は動かさない。style は文書の HTML が
 * style 属性を持つので inline を許す。
 */
export function previewHtml(options: PreviewHtmlOptions): string {
  const csp = [
    "default-src 'none'",
    `style-src ${options.cspSource} 'unsafe-inline'`,
    `img-src ${options.cspSource} https: data:`,
    `font-src ${options.cspSource}`,
    `script-src 'nonce-${options.nonce}'`,
  ].join('; ');
  // 文書の CSS は白い紙に印刷する前提で色を決めている。webview はエディタの配色
  // （ダークテーマなら暗い地と明るい文字）を引き継ぐので、紙の部分だけ明るい配色に戻す。
  // 幅も A4 に固定する。細いパネルに合わせて縮めると枠の中で文字が 1 字ずつ折り返す。
  const paper = `
:root { color-scheme: light; }
html, body { background: #e5e7eb; }
body { padding: 16px; }
#root {
  box-sizing: border-box;
  width: 210mm;
  margin: 0 auto;
  padding: 18mm 16mm;
  background: #fff;
  color: #111;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
}`;
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${escapeAttribute(csp)}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>${paper}
</style>
</head>
<body data-styles-base="${escapeAttribute(options.stylesBaseUri)}">
<main id="root"></main>
<script nonce="${escapeAttribute(options.nonce)}" src="${escapeAttribute(options.scriptUri)}"></script>
</body>
</html>
`;
}
