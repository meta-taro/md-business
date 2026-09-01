import { describe, it, expect } from 'vitest';
import { osWindowTitle } from './osTitle';

describe('窓の題名（タスクバー・Alt+Tab に出るほう）', () => {
  it('フォルダを開いていなければアプリ名だけ', () => {
    expect(osWindowTitle(null)).toBe('md-business');
  });

  it('開いていればフォルダ名を頭に出す（窓が 2 つ並んだとき、これだけが見分けになる）', () => {
    expect(osWindowTitle('C:\\work\\my-lp')).toBe('my-lp — md-business');
  });

  it('区切りが / でも同じ', () => {
    expect(osWindowTitle('/home/u/検証シート')).toBe('検証シート — md-business');
  });

  it('末尾に区切りが付いていても名前が取れる', () => {
    expect(osWindowTitle('C:\\work\\my-lp\\')).toBe('my-lp — md-business');
  });

  it('名前の取れないパスはアプリ名だけに落とす', () => {
    // ドライブ直下・空文字。無理に出すと題名が空や記号だけになる。
    expect(osWindowTitle('C:\\')).toBe('md-business');
    expect(osWindowTitle('/')).toBe('md-business');
    expect(osWindowTitle('')).toBe('md-business');
    expect(osWindowTitle('   ')).toBe('md-business');
  });
});
