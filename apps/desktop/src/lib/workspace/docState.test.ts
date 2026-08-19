import { describe, expect, it } from 'vitest';
import { imageDoc, openedDoc, seedDoc, type OpenImage } from './docState';

const image = (relPath: string): OpenImage => ({
  relPath,
  dataUrl: 'data:image/png;base64,AAAA',
  mime: 'image/png',
  byteSize: 4,
});

describe('seedDoc', () => {
  it('雛形は未編集で始まる（開いた瞬間に保存ボタンが光らない）', () => {
    const doc = seedDoc('# 見本');
    expect(doc.source).toBe('# 見本');
    expect(doc.savedSource).toBe(doc.source);
    expect(doc.savedAt).toBeNull();
    expect(doc.saving).toBe(false);
    expect(doc.image).toBeNull();
    expect(doc.conflict).toBe(false);
  });
});

describe('openedDoc', () => {
  it('読み込んだ直後は未編集', () => {
    const doc = openedDoc('本文');
    expect(doc.source).toBe('本文');
    expect(doc.savedSource).toBe('本文');
  });

  it('保存時刻を持たない（別の文書の時刻を引き継がせないため）', () => {
    expect(openedDoc('本文').savedAt).toBeNull();
  });

  it('画像を持たない', () => {
    expect(openedDoc('本文').image).toBeNull();
  });
});

describe('imageDoc', () => {
  it('本文を持たない（保存も書き出しも押せる状態にしない）', () => {
    const doc = imageDoc(image('図.png'));
    expect(doc.source).toBe('');
    expect(doc.savedSource).toBe('');
  });

  it('未編集なので、開いたまま別のタブへ移っても差分が立たない', () => {
    const doc = imageDoc(image('図.png'));
    expect(doc.source).toBe(doc.savedSource);
  });

  it('渡した画像をそのまま持つ', () => {
    const img = image('写真.jpg');
    expect(imageDoc(img).image).toBe(img);
  });
});

describe('グリッドの見ていた位置', () => {
  it('開いた直後は覚えていない', () => {
    expect(openedDoc('a\tb').grid).toBeNull();
  });

  it('画像で開いたときも覚えていない', () => {
    expect(imageDoc(image('a.png')).grid).toBeNull();
  });
});
