import * as vscode from 'vscode';

import { diagnose, type Problem } from './diagnostics.js';
import { GRID_VIEW_TYPE, TsvGridProvider } from './grid/provider.js';
import { mcpServers } from './mcp/servers.js';
import { PreviewPanel } from './preview/panel.js';
import { diagnoseTsv } from './tsvDiagnostics.js';

// 打鍵のたびに検証すると、書きかけの行に毎回赤線が走る。手が止まってから出す。
const CHANGE_DELAY_MS = 300;

export function activate(context: vscode.ExtensionContext): void {
  const collection = vscode.languages.createDiagnosticCollection('md-business');
  const pending = new Map<string, ReturnType<typeof setTimeout>>();

  const refresh = (doc: vscode.TextDocument): void => {
    if (doc.languageId === 'markdown') {
      collection.set(doc.uri, toDiagnostics(doc, diagnose(doc.getText())));
    } else if (doc.uri.path.toLowerCase().endsWith('.tsv')) {
      // TSV は言語 ID が環境ごとに違う（plaintext / tsv など）ので拡張子で見る。
      collection.set(doc.uri, toDiagnostics(doc, diagnoseTsv(doc.getText())));
    }
  };

  const cancel = (doc: vscode.TextDocument): void => {
    const key = doc.uri.toString();
    const timer = pending.get(key);
    if (timer !== undefined) clearTimeout(timer);
    pending.delete(key);
  };

  context.subscriptions.push(
    collection,
    vscode.workspace.onDidOpenTextDocument(refresh),
    vscode.workspace.onDidSaveTextDocument(refresh),
    vscode.workspace.onDidChangeTextDocument(({ document }) => {
      cancel(document);
      pending.set(
        document.uri.toString(),
        setTimeout(() => {
          pending.delete(document.uri.toString());
          refresh(document);
        }, CHANGE_DELAY_MS),
      );
    }),
    vscode.workspace.onDidCloseTextDocument((doc) => {
      cancel(doc);
      collection.delete(doc.uri);
    }),
    { dispose: () => pending.forEach((timer) => clearTimeout(timer)) },
  );

  const preview = new PreviewPanel(context.extensionUri);
  context.subscriptions.push(
    preview,
    vscode.commands.registerCommand('md-business.showPreview', (uri?: vscode.Uri) => {
      // エディタ上部のボタンからは uri が渡る。コマンドパレットからは渡らない。
      const target =
        (uri && vscode.workspace.textDocuments.find((d) => d.uri.toString() === uri.toString())) ??
        vscode.window.activeTextEditor?.document;
      if (target?.languageId === 'markdown') preview.open(target);
      else void vscode.window.showInformationMessage('Markdown を開いてから実行してください。');
    }),
  );

  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      GRID_VIEW_TYPE,
      new TsvGridProvider(context.extensionUri),
    ),
    vscode.commands.registerCommand('md-business.openGrid', (uri?: vscode.Uri) => {
      const target = uri ?? vscode.window.activeTextEditor?.document.uri;
      if (target?.path.toLowerCase().endsWith('.tsv')) {
        void vscode.commands.executeCommand('vscode.openWith', target, GRID_VIEW_TYPE);
      } else {
        void vscode.window.showInformationMessage('検証シート（.tsv）を開いてから実行してください。');
      }
    }),
  );

  const foldersChanged = new vscode.EventEmitter<void>();
  context.subscriptions.push(
    foldersChanged,
    vscode.workspace.onDidChangeWorkspaceFolders(() => foldersChanged.fire()),
    vscode.lm.registerMcpServerDefinitionProvider('md-business', {
      onDidChangeMcpServerDefinitions: foldersChanged.event,
      provideMcpServerDefinitions: () =>
        mcpServers(
          (vscode.workspace.workspaceFolders ?? []).map((f) => ({
            name: f.name,
            fsPath: f.uri.fsPath,
          })),
          {
            execPath: process.execPath,
            script: vscode.Uri.joinPath(context.extensionUri, 'dist', 'mcp-server.cjs').fsPath,
            version: String(context.extension.packageJSON.version),
          },
        ).map(
          (s) => new vscode.McpStdioServerDefinition(s.label, s.command, s.args, s.env, s.version),
        ),
    }),
  );

  // 拡張が立ち上がる前から開いていた文書にも出す。
  vscode.workspace.textDocuments.forEach(refresh);
}

export function deactivate(): void {}

function toDiagnostics(doc: vscode.TextDocument, problems: Problem[]): vscode.Diagnostic[] {
  return problems.map((problem) => {
    // 行は文書の外を指しうる（読み取り中に編集が入ったときなど）。最終行へ寄せる。
    const index = Math.min(Math.max(problem.line - 1, 0), doc.lineCount - 1);
    const diagnostic = new vscode.Diagnostic(
      doc.lineAt(index).range,
      problem.message,
      problem.severity === 'error'
        ? vscode.DiagnosticSeverity.Error
        : vscode.DiagnosticSeverity.Warning,
    );
    diagnostic.source = 'md-business';
    return diagnostic;
  });
}
