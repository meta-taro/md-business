import * as vscode from 'vscode';

import { diagnose, type Problem } from './diagnostics.js';

// 打鍵のたびに検証すると、書きかけの行に毎回赤線が走る。手が止まってから出す。
const CHANGE_DELAY_MS = 300;

export function activate(context: vscode.ExtensionContext): void {
  const collection = vscode.languages.createDiagnosticCollection('md-business');
  const pending = new Map<string, ReturnType<typeof setTimeout>>();

  const refresh = (doc: vscode.TextDocument): void => {
    if (doc.languageId !== 'markdown') return;
    collection.set(doc.uri, toDiagnostics(doc, diagnose(doc.getText())));
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
