export type UploadResult =
  | { ok: true; src: string }
  | { ok: false; error: string };

const MAX_BYTES = 5 * 1024 * 1024;
const MD_EXTENSIONS = ['.md', '.markdown'];
const UTF8_BOM = '﻿';

function hasMarkdownExtension(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return MD_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function validateUploadedMarkdown(content: string, fileName: string): UploadResult {
  if (typeof fileName !== 'string' || fileName.trim().length === 0) {
    return { ok: false, error: 'ファイル名が空です。' };
  }
  if (!hasMarkdownExtension(fileName)) {
    return { ok: false, error: '拡張子は .md / .markdown のみ受け付けます。' };
  }
  if (typeof content !== 'string') {
    return { ok: false, error: 'ファイル内容を文字列として読み取れませんでした。' };
  }
  if (content.length > MAX_BYTES) {
    return { ok: false, error: 'ファイルが大きすぎます (最大 5 MB)。' };
  }

  const stripped = content.startsWith(UTF8_BOM) ? content.slice(1) : content;
  const normalized = stripped.replace(/\r\n/g, '\n');

  if (normalized.trim().length === 0) {
    return { ok: false, error: 'ファイル内容が空です。' };
  }

  return { ok: true, src: normalized };
}
