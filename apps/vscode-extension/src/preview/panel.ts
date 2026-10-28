import * as vscode from 'vscode';

import { createNonce, previewHtml } from './html.js';
import type { ReadyMessage, UpdateMessage } from './messages.js';

const VIEW_TYPE = 'md-business.preview';
// 打鍵のたびに描き直すと、長い文書で入力が引っかかる。
const CHANGE_DELAY_MS = 300;

/**
 * 横に開くプレビュー。1 枚だけ持ち、いま編集している Markdown を映す。
 * 別の Markdown へ切り替えると、その文書を映し直す。
 */
export class PreviewPanel implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined;
  private document: vscode.TextDocument | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private readonly subscriptions: vscode.Disposable[] = [];

  constructor(private readonly extensionUri: vscode.Uri) {
    this.subscriptions.push(
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (this.panel && editor?.document.languageId === 'markdown') this.show(editor.document);
      }),
      vscode.workspace.onDidChangeTextDocument(({ document }) => {
        if (document !== this.document) return;
        if (this.timer !== undefined) clearTimeout(this.timer);
        this.timer = setTimeout(() => this.post(), CHANGE_DELAY_MS);
      }),
    );
  }

  open(document: vscode.TextDocument): void {
    if (!this.panel) {
      const dist = vscode.Uri.joinPath(this.extensionUri, 'dist');
      this.panel = vscode.window.createWebviewPanel(
        VIEW_TYPE,
        'md-business',
        { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
        { enableScripts: true, localResourceRoots: [dist] },
      );
      const webview = this.panel.webview;
      webview.html = previewHtml({
        cspSource: webview.cspSource,
        nonce: createNonce(),
        scriptUri: webview.asWebviewUri(vscode.Uri.joinPath(dist, 'preview.js')).toString(),
        stylesBaseUri: `${webview.asWebviewUri(dist).toString()}/`,
      });
      webview.onDidReceiveMessage((message: ReadyMessage) => {
        if (message.type === 'ready') this.post();
      });
      this.panel.onDidDispose(() => {
        this.panel = undefined;
        this.document = undefined;
      });
    } else {
      this.panel.reveal(undefined, true);
    }
    this.show(document);
  }

  private show(document: vscode.TextDocument): void {
    this.document = document;
    if (this.panel)
      this.panel.title = `プレビュー: ${vscode.workspace.asRelativePath(document.uri)}`;
    this.post();
  }

  private post(): void {
    this.timer = undefined;
    if (!this.panel || !this.document) return;
    const message: UpdateMessage = { type: 'update', text: this.document.getText() };
    void this.panel.webview.postMessage(message);
  }

  dispose(): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.panel?.dispose();
    this.subscriptions.forEach((s) => s.dispose());
  }
}
