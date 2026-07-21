import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SPLIT_RATIO,
  MIN_PANE_PX,
  clampRatio,
  ratioFromPointer,
  parseStoredRatio,
  stepRatio,
} from './splitRatio';

describe('splitRatio 純ロジック', () => {
  describe('clampRatio', () => {
    it('十分広いコンテナでは中間値をそのまま返す', () => {
      expect(clampRatio(0.5, 1200, 240)).toBeCloseTo(0.5);
      expect(clampRatio(0.4, 1200, 240)).toBeCloseTo(0.4);
    });

    it('各ペインが minPanePx 未満にならないようクランプする', () => {
      // 1000px・min 240 → minRatio 0.24 / maxRatio 0.76
      expect(clampRatio(0.05, 1000, 240)).toBeCloseTo(0.24);
      expect(clampRatio(0.95, 1000, 240)).toBeCloseTo(0.76);
    });

    it('コンテナが狭すぎて両ペインの min を満たせない時は 0.5 に落とす', () => {
      // 400px・min 240 → minRatio 0.6 > maxRatio 0.4 で解なし
      expect(clampRatio(0.2, 400, 240)).toBe(DEFAULT_SPLIT_RATIO);
    });

    it('非有限値・非正のコンテナ幅は既定比へフォールバックする', () => {
      expect(clampRatio(Number.NaN, 1200, 240)).toBe(DEFAULT_SPLIT_RATIO);
      expect(clampRatio(Number.POSITIVE_INFINITY, 1200, 240)).toBe(DEFAULT_SPLIT_RATIO);
      expect(clampRatio(0.5, 0, 240)).toBe(DEFAULT_SPLIT_RATIO);
      expect(clampRatio(0.5, -100, 240)).toBe(DEFAULT_SPLIT_RATIO);
    });

    it('minPanePx 省略時は MIN_PANE_PX を使う', () => {
      const w = 1000;
      expect(clampRatio(0.01, w)).toBeCloseTo(MIN_PANE_PX / w);
    });
  });

  describe('ratioFromPointer', () => {
    it('ポインタ位置をコンテナ内の比率へ換算する', () => {
      // left=0, width=1000, pointer=600 → 0.6
      expect(ratioFromPointer(600, 0, 1000, 240)).toBeCloseTo(0.6);
    });

    it('コンテナの left オフセットを差し引く', () => {
      // left=100, width=1000, pointer=600 → (600-100)/1000 = 0.5
      expect(ratioFromPointer(600, 100, 1000, 240)).toBeCloseTo(0.5);
    });

    it('端に寄せてもクランプ範囲に収まる', () => {
      expect(ratioFromPointer(0, 0, 1000, 240)).toBeCloseTo(0.24);
      expect(ratioFromPointer(1000, 0, 1000, 240)).toBeCloseTo(0.76);
    });
  });

  describe('parseStoredRatio', () => {
    it('有効な (0,1) の文字列を数値化する', () => {
      expect(parseStoredRatio('0.42')).toBeCloseTo(0.42);
    });

    it('null / 空 / 非数 / 範囲外は既定比を返す', () => {
      expect(parseStoredRatio(null)).toBe(DEFAULT_SPLIT_RATIO);
      expect(parseStoredRatio('')).toBe(DEFAULT_SPLIT_RATIO);
      expect(parseStoredRatio('abc')).toBe(DEFAULT_SPLIT_RATIO);
      expect(parseStoredRatio('0')).toBe(DEFAULT_SPLIT_RATIO);
      expect(parseStoredRatio('1')).toBe(DEFAULT_SPLIT_RATIO);
      expect(parseStoredRatio('-0.3')).toBe(DEFAULT_SPLIT_RATIO);
      expect(parseStoredRatio('1.5')).toBe(DEFAULT_SPLIT_RATIO);
    });
  });

  describe('stepRatio（キーボード操作）', () => {
    it('正方向は右ペインを狭め、比率を stepPx 相当だけ増やす', () => {
      // width 1000, step 24px → +0.024
      expect(stepRatio(0.5, +1, 1000, 24, 240)).toBeCloseTo(0.524);
    });

    it('負方向は比率を減らす', () => {
      expect(stepRatio(0.5, -1, 1000, 24, 240)).toBeCloseTo(0.476);
    });

    it('クランプ範囲を超えない', () => {
      expect(stepRatio(0.76, +1, 1000, 24, 240)).toBeCloseTo(0.76);
      expect(stepRatio(0.24, -1, 1000, 24, 240)).toBeCloseTo(0.24);
    });
  });
});
