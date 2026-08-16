import { describe, it, expect } from 'vitest';
import { folderTitle, siteDocumentPaths } from './siteExport';

describe('folderTitle', () => {
  it('開いているフォルダ名を返す', () => {
    expect(folderTitle('C:\\work\\手元の文書')).toBe('手元の文書');
    expect(folderTitle('/home/u/docs')).toBe('docs');
  });

  it('末尾の区切りは無視する', () => {
    expect(folderTitle('C:\\work\\手元の文書\\')).toBe('手元の文書');
    expect(folderTitle('/home/u/docs/')).toBe('docs');
  });

  // 見出しが空のページを出さない。ドライブ直下ならドライブ名が見出しになる。
  it('ドライブ直下でも見出しが空にならない', () => {
    expect(folderTitle('C:\\')).toBe('C:');
    expect(folderTitle('/')).toBe('/');
  });
});

describe('siteDocumentPaths', () => {
  it('.md だけを取り出す', () => {
    const entries = [
      { relPath: '覚書.md', ext: 'md' },
      { relPath: '検証.tsv', ext: 'tsv' },
      { relPath: '取込.json', ext: 'json' },
      { relPath: '設計/基本設計書.md', ext: 'md' },
    ];

    expect(siteDocumentPaths(entries)).toEqual(['覚書.md', '設計/基本設計書.md']);
  });

  it('大文字の拡張子も同じものとして扱う', () => {
    expect(siteDocumentPaths([{ relPath: 'A.MD', ext: 'MD' }])).toEqual(['A.MD']);
  });

  it('.md が無ければ空を返す', () => {
    expect(siteDocumentPaths([{ relPath: '検証.tsv', ext: 'tsv' }])).toEqual([]);
  });
});
