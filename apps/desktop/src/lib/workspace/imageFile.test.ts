import { describe, expect, it } from 'vitest';
import { IMAGE_EXTS, imageExtOf, isImagePath } from './imageFile';

describe('isImagePath', () => {
  it('扱う 6 種類を画像とみなす', () => {
    expect(IMAGE_EXTS).toEqual(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg']);
    for (const ext of IMAGE_EXTS) {
      expect(isImagePath(`docs/図.${ext}`)).toBe(true);
    }
  });

  it('文書は画像ではない', () => {
    expect(isImagePath('docs/a.md')).toBe(false);
    expect(isImagePath('docs/a.tsv')).toBe(false);
    expect(isImagePath('docs/a.json')).toBe(false);
    expect(isImagePath('docs/a.xml')).toBe(false);
  });

  it('大文字の拡張子でも画像とみなす', () => {
    expect(isImagePath('IMG_0001.JPG')).toBe(true);
    expect(imageExtOf('IMG_0001.JPG')).toBe('jpg');
  });

  it('拡張子が無いものは画像ではない', () => {
    expect(isImagePath('README')).toBe(false);
    expect(imageExtOf('README')).toBe(null);
  });

  it('名前に画像の綴りを含むだけでは画像ではない', () => {
    // `png` がフォルダ名や名前の途中に出るだけで開こうとすると、
    // 画像でないものをバイト列として読みにいく。見るのは最後の `.` 以降だけ。
    expect(isImagePath('png/notes.md')).toBe(false);
    expect(isImagePath('report.png.md')).toBe(false);
    expect(isImagePath('archive.tar.gz')).toBe(false);
  });

  it('区切りが Windows 形式でも同じに扱う', () => {
    expect(isImagePath('docs\\領収書\\2026-08.png')).toBe(true);
  });

  it('ドットで始まる名前を拡張子と取り違えない', () => {
    expect(isImagePath('.png')).toBe(false);
    expect(isImagePath('docs/.gitignore')).toBe(false);
  });
});
