import type { ReadyMessage, UpdateMessage } from '../preview/messages.js';
import { renderPreview } from './render.js';

declare function acquireVsCodeApi(): { postMessage(message: ReadyMessage): void };

const root = document.getElementById('root');
const stylesBase = document.body.dataset['stylesBase'] ?? '';

window.addEventListener('message', (event: MessageEvent<UpdateMessage>) => {
  if (root && event.data?.type === 'update') renderPreview(root, event.data.text, stylesBase);
});

acquireVsCodeApi().postMessage({ type: 'ready' });
