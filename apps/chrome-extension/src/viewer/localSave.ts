export const BACKUP_STORAGE_KEY = 'mdb:viewer:last-overwrite-backup';

const MD_EXT = /\.(md|markdown)$/i;
const TSV_EXT = /\.tsv$/i;
const UTF8_BOM = '﻿';

/** 書き出す文書の種類。検証シートは .tsv のまま書き戻す。 */
export type SaveKind = 'markdown' | 'tsv';

/** 開いたときの改行と BOM。エディタは LF にそろえるので、書き戻すときに戻す。 */
export interface SheetEncoding {
  bom: boolean;
  eol: '\n' | '\r\n';
}

export interface SavePickerOptions {
  suggestedName: string;
  types?: Array<{
    description: string;
    accept: Record<string, string[]>;
  }>;
}

export function buildSavePickerOptions(
  suggestedName?: string,
  kind: SaveKind = 'markdown',
): SavePickerOptions {
  if (kind === 'tsv') {
    return {
      suggestedName: ensureTsvExtension(suggestedName ?? 'untitled.tsv'),
      types: [
        {
          description: '検証シート (.tsv)',
          accept: { 'text/tab-separated-values': ['.tsv'] },
        },
      ],
    };
  }
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

export function deriveSuggestedFileName(opts: { existingName?: string; kind?: SaveKind }): string {
  const existing = opts.existingName;
  const tsv = opts.kind === 'tsv';
  if (!existing || existing.length === 0) return tsv ? 'untitled.tsv' : 'untitled.md';
  return tsv ? ensureTsvExtension(existing) : ensureMarkdownExtension(existing);
}

/** 開いた中身の改行と BOM を読む。 */
export function readSheetEncoding(content: string): SheetEncoding {
  return { bom: content.startsWith(UTF8_BOM), eol: content.includes('\r\n') ? '\r\n' : '\n' };
}

/**
 * 検証シートを、開いたときの改行と BOM へ戻す。
 * Markdown と違って LF にそろえない。表計算などで作られたシートは CRLF のことが多く、
 * 1 セル直しただけで全行が差分になると、何を直したのか読めなくなる。
 */
export function restoreSheetEncoding(content: string, encoding: SheetEncoding): string {
  const stripped = content.startsWith(UTF8_BOM) ? content.slice(1) : content;
  const lf = stripped.replace(/\r\n/g, '\n');
  const text = encoding.eol === '\r\n' ? lf.replace(/\n/g, '\r\n') : lf;
  return encoding.bom ? `${UTF8_BOM}${text}` : text;
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

function ensureTsvExtension(name: string): string {
  if (TSV_EXT.test(name)) return name;
  const dot = name.lastIndexOf('.');
  if (dot > 0) return `${name.slice(0, dot)}.tsv`;
  return `${name}.tsv`;
}
