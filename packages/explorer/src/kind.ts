export type FileKind = 'markdown' | 'tsv' | 'image' | 'zumen' | 'yaml' | 'other';

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif']);

/** Windows の区切りも受ける。アプリごとにパスの書き方が違うため。 */
export function baseName(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] ?? '';
}

export function fileKind(path: string): FileKind {
  const name = baseName(path).toLowerCase();
  // `.zumen.yaml` だけの名前は図面の本体を持たない設定ファイル扱いにする
  if (/^[^.].*\.zumen\.ya?ml$/.test(name)) return 'zumen';
  const dot = name.lastIndexOf('.');
  if (dot < 0) return 'other';
  const ext = name.slice(dot + 1);
  if (ext === 'md' || ext === 'markdown') return 'markdown';
  if (ext === 'tsv') return 'tsv';
  if (ext === 'yaml' || ext === 'yml') return 'yaml';
  if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  return 'other';
}
