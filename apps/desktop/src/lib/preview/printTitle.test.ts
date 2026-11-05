import { describe, it, expect, vi } from 'vitest';
import { pdfSaveName, printWithTitle } from './printTitle';

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
