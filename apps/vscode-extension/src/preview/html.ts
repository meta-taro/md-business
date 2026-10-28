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
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${escapeAttribute(csp)}">
<meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body data-styles-base="${escapeAttribute(options.stylesBaseUri)}">
<main id="root"></main>
<script nonce="${escapeAttribute(options.nonce)}" src="${escapeAttribute(options.scriptUri)}"></script>
</body>
</html>
`;
}
