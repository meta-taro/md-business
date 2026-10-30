import { escapeAttribute } from '../preview/html.js';

export interface GridHtmlOptions {
  /** webview.cspSource。 */
  cspSource: string;
  nonce: string;
  scriptUri: string;
}

/**
 * 検証シートを表で編集する webview の外枠。表はスクリプトが DOM で組む。
 *
 * プレビューと違って紙を模さない。入力欄はエディタの一部なので、配色は
 * テーマの変数に従わせる（ダークテーマで白い入力欄が浮かないように）。
 */
export function gridHtml(options: GridHtmlOptions): string {
  const csp = [
    "default-src 'none'",
    `style-src ${options.cspSource} 'unsafe-inline'`,
    `script-src 'nonce-${options.nonce}'`,
  ].join('; ');
  const style = `
body {
  background: var(--vscode-editor-background);
  color: var(--vscode-editor-foreground);
  font-family: var(--vscode-font-family);
  font-size: var(--vscode-font-size);
  padding: 8px 16px;
}
h1 { font-size: 1.2em; margin: 4px 0 12px; }
table { border-collapse: collapse; }
th, td {
  border: 1px solid var(--vscode-panel-border, rgba(128, 128, 128, 0.35));
  padding: 2px 4px;
  vertical-align: top;
  text-align: left;
}
th {
  position: sticky;
  top: 0;
  background: var(--vscode-editorGroupHeader-tabsBackground, var(--vscode-editor-background));
  white-space: nowrap;
}
.required { color: var(--vscode-errorForeground); }
input, select, textarea {
  box-sizing: border-box;
  width: 100%;
  min-width: 6em;
  background: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  border: 1px solid var(--vscode-input-border, transparent);
  font: inherit;
}
input[type="checkbox"] { width: auto; min-width: 0; }
textarea { min-width: 16em; resize: vertical; }
.locked { color: var(--vscode-descriptionForeground); }`;
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${escapeAttribute(csp)}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>${style}
</style>
</head>
<body>
<main id="root"></main>
<script nonce="${escapeAttribute(options.nonce)}" src="${escapeAttribute(options.scriptUri)}"></script>
</body>
</html>
`;
}
