import '../shared/polyfills.js';
import { createDefaultRegistry } from '../plugins/index.js';
import { STORAGE_KEY, type ViewerPayload } from '../shared/storage.js';

const registry = createDefaultRegistry();

interface StarterTemplate {
  schema: string;
  file: string;
  label: string;
  description: string;
  path: string;
}

interface StarterTemplateManifest {
  templates: StarterTemplate[];
}

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

async function openViewerWithSource(source: string, filename: string, explicitPluginId?: string): Promise<void> {
  const pluginSelect = document.getElementById('mdb-schema') as HTMLSelectElement | null;
  const pluginId = explicitPluginId ?? pluginSelect?.value ?? '';

  const payload: ViewerPayload = { source, filename, ...(pluginId ? { pluginId } : {}) };
  await chrome.storage.session.set({ [STORAGE_KEY]: payload });

  const viewerUrl = chrome.runtime.getURL('src/viewer/index.html');
  await chrome.tabs.create({ url: viewerUrl });
  globalThis.close();
}

async function handleFile(file: File): Promise<void> {
  clearError();
  if (!/\.(md|markdown)$/i.test(file.name) && file.type !== 'text/markdown') {
    showError('Markdown (.md) ファイルを選択してください。');
    return;
  }
  const source = await file.text();
  await openViewerWithSource(source, file.name);
}

async function handleTemplateClick(template: StarterTemplate): Promise<void> {
  clearError();
  const url = chrome.runtime.getURL(template.path);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`テンプレート読み込み失敗: ${res.status} ${template.path}`);
  }
  const source = await res.text();
  await openViewerWithSource(source, template.file, template.schema);
}

async function loadStarterTemplates(): Promise<void> {
  const list = document.getElementById('mdb-starter-list');
  if (!list) return;
  try {
    const manifestUrl = chrome.runtime.getURL('templates/manifest.json');
    const res = await fetch(manifestUrl);
    if (!res.ok) {
      list.textContent = 'テンプレート一覧を読み込めませんでした。';
      return;
    }
    const manifest = (await res.json()) as StarterTemplateManifest;
    for (const t of manifest.templates) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mdb-starter__item';
      btn.setAttribute('role', 'listitem');
      btn.dataset['templatePath'] = t.path;

      const title = document.createElement('span');
      title.className = 'mdb-starter__item-title';
      title.textContent = t.label;
      btn.appendChild(title);

      const desc = document.createElement('span');
      desc.className = 'mdb-starter__item-desc';
      desc.textContent = t.description;
      btn.appendChild(desc);

      btn.addEventListener('click', () => {
        handleTemplateClick(t).catch((err: unknown) => showError(formatError(err)));
      });
      list.appendChild(btn);
    }
  } catch (err: unknown) {
    showError(formatError(err));
  }
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
void loadStarterTemplates();
