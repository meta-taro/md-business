import { describe, expect, it } from 'vitest';
import { isSitePart } from './siteFile';

describe('isSitePart', () => {
  it('画面が組み立てない種類は、サイトの部品として扱う', () => {
    expect(isSitePart('index.html')).toBe(true);
    expect(isSitePart('assets/style.css')).toBe(true);
    expect(isSitePart('assets/app.js')).toBe(true);
    expect(isSitePart('assets/app.mjs')).toBe(true);
    expect(isSitePart('fonts/noto.woff2')).toBe(true);
  });

  it('業務文書はサイトの部品ではない', () => {
    expect(isSitePart('見積書.md')).toBe(false);
    expect(isSitePart('検証.tsv')).toBe(false);
    expect(isSitePart('data/明細.json')).toBe(false);
    expect(isSitePart('data/請求.xml')).toBe(false);
  });

  it('画像はサイトの部品ではない', () => {
    // 画像には画像の見せ方がある。ここで拾うと、開いても中身を見せない側へ回る。
    expect(isSitePart('img/logo.png')).toBe(false);
    expect(isSitePart('img/logo.svg')).toBe(false);
  });

  it('大文字の拡張子でも同じに扱う', () => {
    expect(isSitePart('INDEX.HTML')).toBe(true);
    expect(isSitePart('README.MD')).toBe(false);
  });

  it('拡張子が無いものは判断しない', () => {
    expect(isSitePart('README')).toBe(false);
    expect(isSitePart('docs/.gitignore')).toBe(false);
  });

  it('名前の途中の綴りを拡張子と取り違えない', () => {
    expect(isSitePart('html/見積書.md')).toBe(false);
    expect(isSitePart('report.md.html')).toBe(true);
  });

  it('区切りが Windows 形式でも同じに扱う', () => {
    expect(isSitePart('assets\css\style.css')).toBe(true);
  });
});
