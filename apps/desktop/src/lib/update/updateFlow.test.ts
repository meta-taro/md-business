import { describe, it, expect } from 'vitest';
import {
  initialUpdateState,
  reduceUpdate,
  downloadPercent,
  type UpdateState,
} from './updateFlow';

/**
 * 自動アップデートの状態遷移とダウンロード進捗の純ロジック。
 * プラグインのイベント（check 結果・download 進捗）を状態へ畳み込むだけで、
 * ネットワーク・DOM・鍵に一切依存しないため node vitest で全分岐を検査する。
 * Svelte 側はこの状態を描画しイベントを dispatch するだけの薄いグルーになる。
 */

describe('downloadPercent', () => {
  it('total が 0 以下なら 0（進捗不明扱い）', () => {
    expect(downloadPercent(0, 0)).toBe(0);
    expect(downloadPercent(10, 0)).toBe(0);
    expect(downloadPercent(10, -5)).toBe(0);
  });

  it('通常はパーセントを整数で返す', () => {
    expect(downloadPercent(0, 200)).toBe(0);
    expect(downloadPercent(50, 200)).toBe(25);
    expect(downloadPercent(200, 200)).toBe(100);
  });

  it('端数は四捨五入する', () => {
    expect(downloadPercent(1, 3)).toBe(33);
    expect(downloadPercent(2, 3)).toBe(67);
  });

  it('範囲外は 0〜100 にクランプする', () => {
    expect(downloadPercent(-10, 200)).toBe(0);
    expect(downloadPercent(300, 200)).toBe(100);
  });
});

describe('reduceUpdate', () => {
  it('初期状態は idle', () => {
    expect(initialUpdateState()).toEqual({ status: 'idle' });
  });

  it('check-start で checking へ', () => {
    expect(reduceUpdate(initialUpdateState(), { type: 'check-start' })).toEqual({
      status: 'checking',
    });
  });

  it('check-result が null なら up-to-date', () => {
    const s = reduceUpdate({ status: 'checking' }, { type: 'check-result', update: null });
    expect(s).toEqual({ status: 'up-to-date' });
  });

  it('check-result が更新ありなら available（version/notes 保持）', () => {
    const s = reduceUpdate(
      { status: 'checking' },
      { type: 'check-result', update: { version: '0.2.0', notes: '不具合修正' } },
    );
    expect(s).toEqual({ status: 'available', version: '0.2.0', notes: '不具合修正' });
  });

  it('download-start は available の version を引き継ぎ percent 0 で downloading へ', () => {
    const available: UpdateState = { status: 'available', version: '0.2.0', notes: 'x' };
    const s = reduceUpdate(available, { type: 'download-start', contentLength: 400 });
    expect(s).toEqual({
      status: 'downloading',
      version: '0.2.0',
      downloaded: 0,
      total: 400,
      percent: 0,
    });
  });

  it('download-progress は累積して percent を再計算する', () => {
    let s: UpdateState = { status: 'available', version: '0.2.0', notes: 'x' };
    s = reduceUpdate(s, { type: 'download-start', contentLength: 400 });
    s = reduceUpdate(s, { type: 'download-progress', chunkLength: 100 });
    expect(s).toEqual({
      status: 'downloading',
      version: '0.2.0',
      downloaded: 100,
      total: 400,
      percent: 25,
    });
    s = reduceUpdate(s, { type: 'download-progress', chunkLength: 100 });
    expect(s).toMatchObject({ downloaded: 200, percent: 50 });
  });

  it('downloading 以外での download-progress は無視する', () => {
    const checking: UpdateState = { status: 'checking' };
    expect(reduceUpdate(checking, { type: 'download-progress', chunkLength: 100 })).toBe(checking);
  });

  it('download-finished で installing、installed で ready（version 引き継ぎ）', () => {
    const downloading: UpdateState = {
      status: 'downloading',
      version: '0.2.0',
      downloaded: 400,
      total: 400,
      percent: 100,
    };
    const installing = reduceUpdate(downloading, { type: 'download-finished' });
    expect(installing).toEqual({ status: 'installing', version: '0.2.0' });
    const ready = reduceUpdate(installing, { type: 'installed' });
    expect(ready).toEqual({ status: 'ready', version: '0.2.0' });
  });

  it('error はどの状態からでも error へ遷移しメッセージを保持する', () => {
    const downloading: UpdateState = {
      status: 'downloading',
      version: '0.2.0',
      downloaded: 0,
      total: 400,
      percent: 0,
    };
    expect(reduceUpdate(downloading, { type: 'error', message: '通信失敗' })).toEqual({
      status: 'error',
      message: '通信失敗',
    });
  });

  it('reset で idle へ戻る', () => {
    const err: UpdateState = { status: 'error', message: 'x' };
    expect(reduceUpdate(err, { type: 'reset' })).toEqual({ status: 'idle' });
  });
});
