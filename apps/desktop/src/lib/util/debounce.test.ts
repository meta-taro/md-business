import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { debounce } from './debounce';

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('遅延後に 1 回だけ呼ぶ（即時には呼ばない）', () => {
    const spy = vi.fn();
    const fn = debounce(spy, 200);

    fn('a');
    expect(spy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(199);
    expect(spy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('a');
  });

  it('連続呼び出しを合流し、最後の引数だけで 1 回呼ぶ', () => {
    const spy = vi.fn();
    const fn = debounce(spy, 200);

    fn('a');
    vi.advanceTimersByTime(100);
    fn('b');
    vi.advanceTimersByTime(100);
    fn('c');

    // まだ最後の呼び出しから 200ms 経っていない
    vi.advanceTimersByTime(199);
    expect(spy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('c');
  });

  it('間隔を空けた呼び出しはそれぞれ発火する', () => {
    const spy = vi.fn();
    const fn = debounce(spy, 200);

    fn('a');
    vi.advanceTimersByTime(200);
    expect(spy).toHaveBeenCalledTimes(1);

    fn('b');
    vi.advanceTimersByTime(200);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenLastCalledWith('b');
  });

  it('cancel() で保留中の発火を止める', () => {
    const spy = vi.fn();
    const fn = debounce(spy, 200);

    fn('a');
    vi.advanceTimersByTime(100);
    fn.cancel();

    vi.advanceTimersByTime(500);
    expect(spy).not.toHaveBeenCalled();
  });

  it('cancel() 後も再度呼べば通常どおり発火する', () => {
    const spy = vi.fn();
    const fn = debounce(spy, 200);

    fn('a');
    fn.cancel();
    fn('b');
    vi.advanceTimersByTime(200);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('b');
  });

  it('複数引数をそのまま渡す', () => {
    const spy = vi.fn();
    const fn = debounce(spy, 100);

    fn(1, 'x', true);
    vi.advanceTimersByTime(100);

    expect(spy).toHaveBeenCalledWith(1, 'x', true);
  });
});
