import * as vscode from 'vscode';

import { createNonce } from '../preview/html.js';
import { gridHtml } from './html.js';
import type { GridInboundMessage, GridUpdateMessage } from './messages.js';
import { gridModel, planEdit } from './model.js';

export const GRID_VIEW_TYPE = 'md-business.tsvGrid';
// テキスト側で打っている間は表を描き直さない。手が止まってから映す。
const CHANGE_DELAY_MS = 300;

/**
 * 検証シート TSV を表で編集するエディタ。正本はテキストのままで、表は 1 セル書くたびに
 * その行だけを書き換える。同じファイルをテキストで開いていても、取り消し・保存は共通になる。
 */
export class TsvGridProvider implements vscode.CustomTextEditorProvider {
  constructor(private readonly extensionUri: vscode.Uri) {}

  resolveCustomTextEditor(document: vscode.TextDocument, panel: vscode.WebviewPanel): void {
    const dist = vscode.Uri.joinPath(this.extensionUri, 'dist');
    const webview = panel.webview;
    webview.options = { enableScripts: true, localResourceRoots: [dist] };
    webview.html = gridHtml({
      cspSource: webview.cspSource,
      nonce: createNonce(),
      scriptUri: webview.asWebviewUri(vscode.Uri.joinPath(dist, 'tsvGrid.js')).toString(),
    });

    let timer: ReturnType<typeof setTimeout> | undefined;
    const post = (): void => {
      timer = undefined;
      const message: GridUpdateMessage = { type: 'update', model: gridModel(document.getText()) };
      void webview.postMessage(message);
    };

    const subscriptions = [
      webview.onDidReceiveMessage(async (message: GridInboundMessage) => {
        if (message.type === 'ready') return post();
        if (message.type !== 'edit') return;
        // webview の言い分をそのまま書かない。表を描いた後に行がずれていれば書かずに映し直す。
        const plan = planEdit(document.getText(), message.edit);
        if (plan === null) return post();
        const edit = new vscode.WorkspaceEdit();
        edit.replace(document.uri, document.lineAt(plan.line).range, plan.text);
        if (!(await vscode.workspace.applyEdit(edit))) post();
      }),
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.document !== document) return;
        if (timer !== undefined) clearTimeout(timer);
        timer = setTimeout(post, CHANGE_DELAY_MS);
      }),
    ];

    panel.onDidDispose(() => {
      if (timer !== undefined) clearTimeout(timer);
      subscriptions.forEach((s) => s.dispose());
    });
  }
}
