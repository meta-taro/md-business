import { describe, it, expect, vi } from 'vitest';
import { canPrintDirectly, pdfSaveName, printWithTitle, directPdfName } from './printTitle';

function fakeFrame() {
  const listeners: Array<() => void> = [];
  return {
    focus: vi.fn(),
    print: vi.fn(),
    addEventListener: vi.fn((_type: 'afterprint', listener: () => void) => listeners.push(listener)),
    finish: () => listeners.splice(0).forEach((l) => l()),
  };
}

describe('印刷のあいだだけ題名を差し替える', () => {
  it('印刷の前に保存名へ差し替え、印刷が終わったら戻す', () => {
    const host = { title: 'md-business' };
    const frame = fakeFrame();
    frame.print.mockImplementation(() => expect(host.title).toBe('基本設計書_SPEC-001_v1.0.0'));
    printWithTitle(host, frame, '基本設計書_SPEC-001_v1.0.0');
    expect(frame.print).toHaveBeenCalledOnce();
    frame.finish();
    expect(host.title).toBe('md-business');
  });

  it('名前が無ければ題名に触れずに印刷する', () => {
    const host = { title: 'md-business' };
    const frame = fakeFrame();
    printWithTitle(host, frame, '');
    expect(host.title).toBe('md-business');
    expect(frame.print).toHaveBeenCalledOnce();
    expect(frame.addEventListener).not.toHaveBeenCalled();
  });
});

describe('保存名の選び方', () => {
  it('スキーマが作った名前を先に使い、無ければ文書タイトル', () => {
    expect(pdfSaveName({ pdfFileName: 'A_1', documentTitle: 'A' })).toBe('A_1');
    expect(pdfSaveName({ documentTitle: '見出し' })).toBe('見出し');
    expect(pdfSaveName({ pdfFileName: '', documentTitle: '見出し' })).toBe('見出し');
    expect(pdfSaveName({ pdfFileName: '  ', documentTitle: ' ' })).toBe('');
  });
});

describe('PDF を直接作れる環境', () => {
  it('Windows だけ直接作り、ほかの OS は印刷の画面へ回す', () => {
    expect(canPrintDirectly('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Edg/130.0')).toBe(true);
    expect(canPrintDirectly('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15')).toBe(false);
    expect(canPrintDirectly('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36')).toBe(false);
  });
});

describe('直接作るときの保存名', () => {
  it('印刷の画面と同じく、スキーマが作った名前、無ければ文書タイトルにする', () => {
    expect(directPdfName({ pdfFileName: 'A_1', documentTitle: 'A' })).toBe('A_1');
    expect(directPdfName({ documentTitle: '基本設計書' })).toBe('基本設計書');
  });

  it('ファイル名にできないタイトルなら名前を渡さない（元の文書と同じ名前で置く）', () => {
    expect(directPdfName({ documentTitle: '  ' })).toBeNull();
    expect(directPdfName({ documentTitle: '請求書 2026/11' })).toBeNull();
    expect(directPdfName({ documentTitle: 'a\\b' })).toBeNull();
    expect(directPdfName({ documentTitle: '改\n行' })).toBeNull();
    expect(directPdfName({ documentTitle: 'u0000' })).toBe('u0000');
    expect(directPdfName({ documentTitle: '終わりが点.' })).toBeNull();
    expect(directPdfName({ documentTitle: 'CON' })).toBeNull();
    expect(directPdfName({ documentTitle: 'あ'.repeat(101) })).toBeNull();
  });
});
