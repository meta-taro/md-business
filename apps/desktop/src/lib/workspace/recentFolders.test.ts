import { describe, it, expect } from 'vitest';
import {
  parseRecentFolders,
  serializeRecentFolders,
  addRecentFolder,
  removeRecentFolder,
  folderLabel,
  RECENT_FOLDERS_MAX,
} from './recentFolders';

describe('parseRecentFolders', () => {
  it('JSON 配列を順序どおり読む', () => {
    expect(parseRecentFolders('["C:\\\\a","C:\\\\b"]')).toEqual(['C:\\a', 'C:\\b']);
  });

  it('未保存（null）・空文字は空配列', () => {
    expect(parseRecentFolders(null)).toEqual([]);
    expect(parseRecentFolders('')).toEqual([]);
    expect(parseRecentFolders('   ')).toEqual([]);
  });

  it('壊れた JSON は空配列（例外を投げない）', () => {
    expect(parseRecentFolders('{')).toEqual([]);
    expect(parseRecentFolders('not json')).toEqual([]);
  });

  it('配列でない JSON は空配列', () => {
    expect(parseRecentFolders('"C:\\\\a"')).toEqual([]);
    expect(parseRecentFolders('{"a":1}')).toEqual([]);
    expect(parseRecentFolders('null')).toEqual([]);
  });

  it('文字列でない要素・空白のみの要素は捨てる', () => {
    expect(parseRecentFolders('["C:\\\\a",1,null,{"x":1},"  ","C:\\\\b"]')).toEqual([
      'C:\\a',
      'C:\\b',
    ]);
  });

  it('前後の空白を落とし、重複は先勝ちで 1 件に畳む', () => {
    expect(parseRecentFolders('["  C:\\\\a  ","C:\\\\b","C:\\\\a"]')).toEqual(['C:\\a', 'C:\\b']);
  });

  it('上限を超える分は捨てる', () => {
    const many = Array.from({ length: RECENT_FOLDERS_MAX + 5 }, (_, i) => `/p/${i}`);
    expect(parseRecentFolders(JSON.stringify(many))).toEqual(many.slice(0, RECENT_FOLDERS_MAX));
  });
});

describe('serializeRecentFolders', () => {
  it('parse で往復できる', () => {
    const list = ['C:\\業務\\設計', '/home/user/docs'];
    expect(parseRecentFolders(serializeRecentFolders(list))).toEqual(list);
  });
});

describe('addRecentFolder', () => {
  it('新しいものを先頭に積む（最近開いた順）', () => {
    expect(addRecentFolder(['/b'], '/a')).toEqual(['/a', '/b']);
  });

  it('既にある path は重複させず先頭へ移す', () => {
    expect(addRecentFolder(['/a', '/b', '/c'], '/c')).toEqual(['/c', '/a', '/b']);
  });

  it('先頭と同じ path なら順序を変えない', () => {
    const list = ['/a', '/b'];
    expect(addRecentFolder(list, '/a')).toEqual(['/a', '/b']);
  });

  it('上限を超えたら古いものから落ちる', () => {
    const full = Array.from({ length: RECENT_FOLDERS_MAX }, (_, i) => `/p/${i}`);
    const next = addRecentFolder(full, '/new');
    expect(next).toHaveLength(RECENT_FOLDERS_MAX);
    expect(next[0]).toBe('/new');
    expect(next).not.toContain(`/p/${RECENT_FOLDERS_MAX - 1}`);
  });

  it('空・空白のみの path は積まない', () => {
    expect(addRecentFolder(['/a'], '')).toEqual(['/a']);
    expect(addRecentFolder(['/a'], '   ')).toEqual(['/a']);
  });

  it('入力配列を破壊しない', () => {
    const list = ['/a'];
    addRecentFolder(list, '/b');
    expect(list).toEqual(['/a']);
  });
});

describe('removeRecentFolder', () => {
  it('指定 path を取り除く', () => {
    expect(removeRecentFolder(['/a', '/b', '/c'], '/b')).toEqual(['/a', '/c']);
  });

  it('無い path は素通り', () => {
    expect(removeRecentFolder(['/a'], '/zzz')).toEqual(['/a']);
  });

  it('入力配列を破壊しない', () => {
    const list = ['/a', '/b'];
    removeRecentFolder(list, '/a');
    expect(list).toEqual(['/a', '/b']);
  });
});

describe('folderLabel', () => {
  it('Windows パスを末尾フォルダ名と親に分ける', () => {
    expect(folderLabel('C:\\claude\\md-business')).toEqual({
      name: 'md-business',
      parent: 'C:\\claude',
    });
  });

  it('POSIX パスを末尾フォルダ名と親に分ける', () => {
    expect(folderLabel('/home/user/docs')).toEqual({ name: 'docs', parent: '/home/user' });
  });

  it('日本語のフォルダ名も欠けない', () => {
    expect(folderLabel('C:\\業務\\検証シート')).toEqual({
      name: '検証シート',
      parent: 'C:\\業務',
    });
  });

  it('末尾の区切りは無視する', () => {
    expect(folderLabel('C:\\claude\\md-business\\')).toEqual({
      name: 'md-business',
      parent: 'C:\\claude',
    });
    expect(folderLabel('/home/user/docs/')).toEqual({ name: 'docs', parent: '/home/user' });
  });

  it('ドライブ直下・ルート直下は親を空にする', () => {
    expect(folderLabel('C:\\')).toEqual({ name: 'C:\\', parent: '' });
    expect(folderLabel('/')).toEqual({ name: '/', parent: '' });
  });

  it('親が無い相対名はそのまま名前になる', () => {
    expect(folderLabel('docs')).toEqual({ name: 'docs', parent: '' });
  });
});
