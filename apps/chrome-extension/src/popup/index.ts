import { createDefaultRegistry } from '../plugins/index.js';
import { STORAGE_KEY, type ViewerPayload } from '../shared/storage.js';

const registry = createDefaultRegistry();

function populateSchemaSelect(): void {
  const select = document.getElementById('mdb-schema') as HTMLSelectElement | null;
  if (!select) return;

  const auto = document.createElement('option');
  auto.value = '';
  auto.textContent = '自動判定（推奨）';
  select.appendChild(auto);

  for (const plugin of registry.list()) {
    const opt = document.createElement('option');
    opt.value = plugin.id;
    opt.textContent = plugin.label;
    select.appendChild(opt);
  }
}

function showError(message: string): void {
  const el = document.getElementById('mdb-error');
  if (!el) return;
  el.textContent = message;
  el.hidden = false;
}

function clearError(): void {
  const el = document.getElementById('mdb-error');
  if (!el) return;
  el.hidden = true;
}

async function handleFile(file: File): Promise<void> {
  clearError();
  if (!/\.(md|markdown)$/i.test(file.name) && file.type !== 'text/markdown') {
    showError('Markdown (.md) ファイルを選択してください。');
    return;
  }
  const source = await file.text();
  const pluginSelect = document.getElementById('mdb-schema') as HTMLSelectElement | null;
  const pluginId = pluginSelect?.value || undefined;

  const payload: ViewerPayload = { source, filename: file.name, ...(pluginId ? { pluginId } : {}) };
  await chrome.storage.session.set({ [STORAGE_KEY]: payload });

  const viewerUrl = chrome.runtime.getURL('src/viewer/index.html');
  await chrome.tabs.create({ url: viewerUrl });
  globalThis.close();
}

function wireDropzone(): void {
  const dropzone = document.getElementById('mdb-dropzone');
  const input = document.getElementById('mdb-file') as HTMLInputElement | null;
  if (!dropzone || !input) return;

  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (file) handleFile(file).catch((err: unknown) => showError(formatError(err)));
  });

  ['dragenter', 'dragover'].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.dataset['active'] = 'true';
    }),
  );
  ['dragleave', 'drop'].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.dataset['active'] = 'false';
    }),
  );
  dropzone.addEventListener('drop', (e) => {
    const dt = (e as DragEvent).dataTransfer;
    const file = dt?.files?.[0];
    if (file) handleFile(file).catch((err: unknown) => showError(formatError(err)));
  });
}

function formatError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

populateSchemaSelect();
wireDropzone();
