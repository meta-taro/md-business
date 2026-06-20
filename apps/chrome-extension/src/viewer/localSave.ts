export const BACKUP_STORAGE_KEY = 'mdb:viewer:last-overwrite-backup';

const MD_EXT = /\.(md|markdown)$/i;
const UTF8_BOM = '﻿';

export interface SavePickerOptions {
  suggestedName: string;
  types?: Array<{
    description: string;
    accept: Record<string, string[]>;
  }>;
}

export function buildSavePickerOptions(suggestedName?: string): SavePickerOptions {
  const name = ensureMarkdownExtension(suggestedName ?? 'untitled.md');
  return {
    suggestedName: name,
    types: [
      {
        description: 'Markdown (.md, .markdown)',
        accept: { 'text/markdown': ['.md', '.markdown'] },
      },
    ],
  };
}

export function normalizeForSave(content: string): string {
  const stripped = content.startsWith(UTF8_BOM) ? content.slice(1) : content;
  const lf = stripped.replace(/\r\n/g, '\n');
  if (lf.length === 0) return '\n';
  if (lf.endsWith('\n')) return lf;
  return lf + '\n';
}

export function deriveSuggestedFileName(opts: { existingName?: string }): string {
  const existing = opts.existingName;
  if (!existing || existing.length === 0) return 'untitled.md';
  return ensureMarkdownExtension(existing);
}

export interface BackupRecord {
  key: string;
  payload: string;
}

export function buildBackupRecord(src: string, fileName: string, at: number): BackupRecord {
  const payload = JSON.stringify({
    src,
    fileName,
    savedAt: new Date(at).toISOString(),
  });
  return { key: BACKUP_STORAGE_KEY, payload };
}

function ensureMarkdownExtension(name: string): string {
  if (MD_EXT.test(name)) return name;
  const dot = name.lastIndexOf('.');
  if (dot > 0) return `${name.slice(0, dot)}.md`;
  return `${name}.md`;
}
