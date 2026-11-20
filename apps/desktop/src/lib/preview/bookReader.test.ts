// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { attachBookReader, BOOK_CLASS, type BookReader } from './bookReader';
import { bookMetrics } from './bookLayout';
import { SHEET_BASE_WIDTH } from './bookSheets';

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

  it('左右の端にめくる矢印を出し、端のページでは向こう側の矢印を隠す', () => {
    reader = attachBookReader(document, { zoom: 1 });
    const prev = document.querySelector<HTMLButtonElement>('.mdb-book-prev')!;
    const next = document.querySelector<HTMLButtonElement>('.mdb-book-next')!;
    expect(prev.hidden).toBe(true);
    expect(next.hidden).toBe(false);
    next.click();
    expect(reader.state().page).toBe(2);
    expect(prev.hidden).toBe(false);
    reader.turn(99);
    expect(next.hidden).toBe(true);
    prev.click();
    expect(reader.state().page).toBe(6);
  });

  it('めくり方の案内は開いたときだけ出し、一度めくれば消す', () => {
    reader = attachBookReader(document, { zoom: 1, hint: 'めくれます' });
    const hint = (): Element | null => document.querySelector('.mdb-book-hint');
    expect(hint()?.textContent).toBe('めくれます');
    reader.turn(1);
    expect(hint()).toBeNull();
  });

  it('1 画面に収まる短い文書には矢印も案内も出さない', () => {
    setPages(2);
    reader = attachBookReader(document, { zoom: 1, hint: 'めくれます' });
    expect(
      document.querySelector<HTMLButtonElement>('.mdb-book-next')!.hidden
    ).toBe(true);
    expect(document.querySelector('.mdb-book-hint')).toBeNull();
  });

  it('外すと元の縦に流れる画面へ戻り、操作も受けない', () => {
    const onPage = vi.fn();
    const detached = attachBookReader(document, { zoom: 1, onPage });
    detached.destroy();
    expect(root().classList.contains(BOOK_CLASS)).toBe(false);
    expect(root().style.getPropertyValue('--book-shift')).toBe('');
    expect(label()).toBeNull();
    expect(document.querySelector('.mdb-book-next')).toBeNull();
    onPage.mockClear();
    key('ArrowRight');
    window.dispatchEvent(new MouseEvent('click', { clientX: 1200 }));
    expect(onPage).not.toHaveBeenCalled();
  });
});

describe('attachBookReader（原本のページ区切りがある文書）', () => {
  const MARKED =
    '<h1>題</h1>' +
    '<div class="page">p.1</div><p>一</p>' +
    '<div class="page">p.2</div><p>二</p>' +
    '<div class="page">p.3</div><p id="three">三</p>';

  beforeEach(() => {
    document.body.innerHTML = MARKED;
  });

  const sheets = (): HTMLElement[] =>
    Array.from(document.querySelectorAll<HTMLElement>('.mdb-sheet'));

  it('区切りごとに 1 ページにする。区切りより前の冒頭は 1 ページ目に含める', () => {
    reader = attachBookReader(document, { zoom: 1 });
    expect(root().classList.contains('mdb-sheets')).toBe(true);
    expect(sheets()).toHaveLength(3);
    expect(sheets()[0]!.textContent).toBe('題p.1一');
    expect(sheets()[2]!.textContent).toBe('p.3三');
    expect(reader.state().total).toBe(3);
    expect(label()).toBe('p.1–p.2 · 1–2 / 3');
  });

  it('はみ出すページは、そのページの中で縮めて収める', () => {
    reader = attachBookReader(document, { zoom: 1 });
    const sheet = sheets()[1]!;
    const fit = sheet.querySelector<HTMLElement>('.mdb-sheet-fit')!;
    for (const s of sheets()) {
      Object.defineProperty(s, 'clientWidth', { configurable: true, value: SHEET_BASE_WIDTH });
    }
    Object.defineProperty(sheet, 'clientHeight', { configurable: true, value: 800 });
    Object.defineProperty(fit, 'scrollHeight', { configurable: true, value: 1600 });
    reader.refresh();
    expect(fit.style.getPropertyValue('--sheet-scale')).toBe('0.5');
    expect(
      sheets()[0]!
        .querySelector<HTMLElement>('.mdb-sheet-fit')!
        .style.getPropertyValue('--sheet-scale')
    ).toBe('1');
    // 中身はいつも同じ組み幅で組む（窓の幅で折り返し直さない）
    expect(root().style.getPropertyValue('--sheet-base-width')).toBe(`${SHEET_BASE_WIDTH}px`);
  });

  it('原本の番号を指定して開く。無い番号では動かない', () => {
    reader = attachBookReader(document, { zoom: 1 });
    expect(reader.goTo('p.3')).toBe(true);
    expect(reader.state().page).toBe(2);
    expect(reader.goTo('9')).toBe(false);
    expect(reader.state().page).toBe(2);
  });

  it('ページ表示を押すと番号を打てる。Enter で開く', () => {
    reader = attachBookReader(document, { zoom: 1 });
    document.querySelector<HTMLButtonElement>('.mdb-book-page')!.click();
    const input = document.querySelector<HTMLInputElement>('.mdb-book-jump')!;
    expect(input.hidden).toBe(false);
    input.value = '3';
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    );
    expect(reader.state().page).toBe(2);
    expect(input.hidden).toBe(true);
  });

  it('打った番号が無ければ、入力を開いたまま知らせる', () => {
    reader = attachBookReader(document, { zoom: 1 });
    document.querySelector<HTMLButtonElement>('.mdb-book-page')!.click();
    const input = document.querySelector<HTMLInputElement>('.mdb-book-jump')!;
    input.value = '99';
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    );
    expect(input.hidden).toBe(false);
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(reader.state().page).toBe(0);
  });

  it('要素が載っているページを開く', () => {
    reader = attachBookReader(document, { zoom: 1 });
    reader.showElement(document.getElementById('three')!);
    expect(reader.state().page).toBe(2);
  });

  it('外すと元の並びへ戻す', () => {
    const detached = attachBookReader(document, { zoom: 1 });
    detached.destroy();
    expect(document.body.innerHTML).toBe(MARKED);
    expect(root().classList.contains('mdb-sheets')).toBe(false);
  });

  it('縮めたページでも、線を描く面がページの下端まで届くよう中身の高さを足す', () => {
    reader = attachBookReader(document, { zoom: 1 });
    const sheet = sheets()[0]!;
    const fit = sheet.querySelector<HTMLElement>('.mdb-sheet-fit')!;
    Object.defineProperty(sheet, 'clientWidth', { configurable: true, value: SHEET_BASE_WIDTH / 2 });
    Object.defineProperty(sheet, 'clientHeight', { configurable: true, value: 400 });
    Object.defineProperty(fit, 'scrollHeight', { configurable: true, value: 300 });
    reader.refresh();
    // 倍率 0.5 で 400px のページを覆うには、組み幅の側で 800px 要る
    expect(fit.style.minHeight).toBe('800px');
  });

  it('書き込みを渡すと、ページごとに線の面と道具を置き、外すときに片付ける', async () => {
    const saved: string[] = [];
    const detached = attachBookReader(document, {
      zoom: 1,
      ink: {
        store: { load: () => Promise.resolve(null), save: (json) => (saved.push(json), Promise.resolve()) },
        labels: { pen: 'Pen', highlighter: 'Highlighter', eraser: 'Eraser' },
      },
    });
    expect(document.querySelectorAll('.mdb-sheet-fit > svg.mdb-ink')).toHaveLength(3);
    expect(document.querySelector('.mdb-ink-bar')).not.toBeNull();
    detached.destroy();
    expect(document.body.innerHTML).toBe(MARKED);
    expect(document.querySelector('.mdb-ink-bar')).toBeNull();
  });

  it('ペンを持っている間は、押してもめくらない', async () => {
    reader = attachBookReader(document, {
      zoom: 1,
      ink: {
        store: { load: () => Promise.resolve(null), save: () => Promise.resolve() },
        labels: { pen: 'Pen', highlighter: 'Highlighter', eraser: 'Eraser' },
      },
    });
    document.querySelector<HTMLButtonElement>('.mdb-ink-bar button[title="Pen"]')!.click();
    document.body.dispatchEvent(
      new MouseEvent('click', { clientX: 1500, clientY: 100, bubbles: true, button: 0 })
    );
    expect(reader.state().page).toBe(0);
  });
});

describe('attachBookReader（区切りの無い文書には書き込まない）', () => {
  it('段組みで流す文書には線の面も道具も置かない', () => {
    reader = attachBookReader(document, {
      zoom: 1,
      ink: {
        store: { load: () => Promise.resolve(null), save: () => Promise.resolve() },
        labels: { pen: 'Pen', highlighter: 'Highlighter', eraser: 'Eraser' },
      },
    });
    expect(document.querySelector('.mdb-ink-bar')).toBeNull();
  });
});

describe('attachBookReader（区切りの無い文書でも番号で飛べる）', () => {
  it('通し番号で開く', () => {
    reader = attachBookReader(document, { zoom: 1 });
    expect(reader.goTo('5')).toBe(true);
    expect(reader.state().page).toBe(4);
  });
});
