import type { GridInboundMessage, GridUpdateMessage } from '../grid/messages.js';
import { renderGrid } from './gridView.js';

declare function acquireVsCodeApi(): { postMessage(message: GridInboundMessage): void };

const vscode = acquireVsCodeApi();
const root = document.getElementById('root');

window.addEventListener('message', (event: MessageEvent<GridUpdateMessage>) => {
  if (root && event.data?.type === 'update') {
    renderGrid(root, event.data.model, (edit) => vscode.postMessage({ type: 'edit', edit }));
  }
});

vscode.postMessage({ type: 'ready' });
