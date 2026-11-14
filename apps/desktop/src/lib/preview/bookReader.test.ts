// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { attachBookReader, BOOK_CLASS, type BookReader } from './bookReader';
import { bookMetrics } from './bookLayout';

/** jsdom は組版をしないので、窓の大きさと段組みの横幅を決め打ちで与える。 */
function setWindow(width: number, height: number): void {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: width,
  });
  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    value: height,
  });
}

function setPages(pages: number, width = 1600, height = 900): void {
  const m = bookMetrics(width, height);
  Object.defineProperty(document.body, 'scrollWidth', {
    configurable: true,
    value: m.padX + m.pageWidth * pages + m.gap * (pages - 1),
  });
}

const root = (): HTMLElement => document.documentElement;
const label = (): string | null =>
  document.querySelector('.mdb-book-page')?.textContent ?? null;
const key = (k: string, init: KeyboardEventInit = {}): void => {
  window.dispatchEvent(
    new KeyboardEvent('keydown', { key: k, cancelable: true, ...init })
  );
};

let reader: BookReader | null = null;

beforeEach(() => {
  document.body.innerHTML = '<p>本文</p><a href="#x">リンク</a>';
  setWindow(1600, 900);
  setPages(10);
});

afterEach(() => {
  reader?.destroy();
  reader = null;
});

describe('attachBookReader', () => {
  it('取り付けると本の形になり、見開きの先頭を出す', () => {
    reader = attachBookReader(document, { zoom: 1 });
    expect(root().classList.contains(BOOK_CLASS)).toBe(true);
    expect(root().style.getPropertyValue('--book-columns')).toBe('2');
    expect(root().style.getPropertyValue('--book-height')).toBe('900px');
    expect(label()).toBe('1–2 / 10');
  });

  it('めくると 1 画面ぶん横へずれる。端では止まる', () => {
    reader = attachBookReader(document, { zoom: 1 });
    const { stride } = bookMetrics(1600, 900);
    reader.turn(1);
    expect(root().style.getPropertyValue('--book-shift')).toBe(
      String(2 * stride)
    );
    expect(label()).toBe('3–4 / 10');
    reader.turn(99);
    expect(reader.state().page).toBe(8);
    reader.turn(-99);
    expect(reader.state().page).toBe(0);
  });

  it('←→ / PageDown / Space でめくる。修飾キー付きは触らない（倍率・保存の操作）', () => {
    reader = attachBookReader(document, { zoom: 1 });
    key('ArrowRight');
    key('PageDown');
    key(' ');
    expect(reader.state().page).toBe(6);
    key('ArrowLeft');
    expect(reader.state().page).toBe(4);
    key('ArrowRight', { ctrlKey: true });
    expect(reader.state().page).toBe(4);
    key('End');
    expect(reader.state().page).toBe(8);
    key('Home');
    expect(reader.state().page).toBe(0);
  });

  it('右半分を押すと進み、左半分で戻る。リンクを押してもめくらない', () => {
    reader = attachBookReader(document, { zoom: 1 });
    window.dispatchEvent(
      new MouseEvent('click', { clientX: 1200, bubbles: true })
    );
    expect(reader.state().page).toBe(2);
    window.dispatchEvent(
      new MouseEvent('click', { clientX: 100, bubbles: true })
    );
    expect(reader.state().page).toBe(0);
    document
      .querySelector('a')!
      .dispatchEvent(new MouseEvent('click', { clientX: 1200, bubbles: true }));
    expect(reader.state().page).toBe(0);
  });

  it('ホイールは間を空けて 1 回 1 めくり', () => {
    reader = attachBookReader(document, { zoom: 1 });
    window.dispatchEvent(
      new WheelEvent('wheel', { deltaY: 40, cancelable: true })
    );
    window.dispatchEvent(
      new WheelEvent('wheel', { deltaY: 40, cancelable: true })
    );
    expect(reader.state().page).toBe(2);
  });

  it('倍率を上げると 1 ページの幅が広がり、狭くなれば 1 ページずつになる', () => {
    reader = attachBookReader(document, { zoom: 1 });
    reader.refresh(2);
    expect(root().style.getPropertyValue('--book-columns')).toBe('1');
    expect(root().style.getPropertyValue('--book-height')).toBe('450px');
  });

  it('開き直したとき、前に読んでいたページから始められる', () => {
    reader = attachBookReader(document, { zoom: 1, initialPage: 5 });
    expect(reader.state().page).toBe(4);
  });

  it('ページが変わるたびに知らせる', () => {
    const onPage = vi.fn();
    reader = attachBookReader(document, { zoom: 1, onPage });
    reader.turn(1);
    expect(onPage).toHaveBeenLastCalledWith({ page: 2, perView: 2, total: 10 });
  });

  it('要素が載っているページを開く', () => {
    reader = attachBookReader(document, { zoom: 1 });
    const m = bookMetrics(1600, 900);
    const target = document.querySelector('p')!;
    // 6 段目（0 始まりで 5）の中ほどにあることにする。
    const x = m.padX + m.stride * 5 + 10;
    vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({
      left: x,
    } as DOMRect);
    vi.spyOn(document.body, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      width: 1600,
    } as DOMRect);
    Object.defineProperty(document.body, 'offsetWidth', {
      configurable: true,
      value: 1600,
    });
    reader.showElement(target);
    expect(reader.state().page).toBe(4);
  });

  it('外すと元の縦に流れる画面へ戻り、操作も受けない', () => {
    const onPage = vi.fn();
    const detached = attachBookReader(document, { zoom: 1, onPage });
    detached.destroy();
    expect(root().classList.contains(BOOK_CLASS)).toBe(false);
    expect(root().style.getPropertyValue('--book-shift')).toBe('');
    expect(label()).toBeNull();
    onPage.mockClear();
    key('ArrowRight');
    window.dispatchEvent(new MouseEvent('click', { clientX: 1200 }));
    expect(onPage).not.toHaveBeenCalled();
  });
});
