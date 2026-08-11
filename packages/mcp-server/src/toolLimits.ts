/**
 * 調査ツールが共通で使う「頭の押さえ方」と伏せ字件数の集計。
 * -----------------------------------------------------------------------------
 * 調査ツールは戻り値がそのままモデルへ渡るため、どのツールも同じ形で
 * 上限を持ち、同じ形で伏せた件数を返す。その共通部分をここに置く。
 */
import type { SecretKind } from './maskSecrets.js';

/** 伏せた件数（種別ごと）。 */
export type MaskCounts = Partial<Record<SecretKind, number>>;

/** 伏せた件数を足し込む。 */
export function addCounts(into: MaskCounts, from: MaskCounts): void {
  for (const [kind, count] of Object.entries(from)) {
    const key = kind as SecretKind;
    into[key] = (into[key] ?? 0) + count;
  }
}

/**
 * 呼び出し側の指定を既定値と上下限の中へ収める。
 * 未指定・数でない値は既定値に倒す（例外にせず、必ず有限の上限を持たせるため）。
 */
export function clamp(
  value: number | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.trunc(value), min), max);
}
