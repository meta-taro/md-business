/**
 * 窓ごとに分けて覚えるための保存先の名前。
 *
 * 「最後に開いていたフォルダ」のように、窓ごとに違って当然のものがある。名前を分けずに
 * 2 つの窓で書くと、後から書いた側が先の窓の分を上書きし、次の起動でどちらも同じ
 * フォルダを開く。
 *
 * 最初の窓だけは今までと同じ名前のままにしてある。分けた名前へ移すと、これまで使って
 * きた人の「前回の続き」が 1 度だけ消える。
 */
import { getCurrentWindow } from '@tauri-apps/api/window';

/** 名前を分けない窓（`tauri.conf.json` で定義してある最初の窓）。 */
const MAIN_LABEL = 'main';

export function scopedKey(base: string, label: string): string {
  return label === MAIN_LABEL ? base : `${base}:${label}`;
}

/**
 * 今いる窓の名前。アプリの外（テスト・ビルド時の事前描画）では最初の窓として扱う。
 */
export function currentWindowLabel(): string {
  try {
    return getCurrentWindow().label;
  } catch {
    return MAIN_LABEL;
  }
}

/** 今いる窓に紐づく保存先の名前。 */
export function windowKey(base: string): string {
  return scopedKey(base, currentWindowLabel());
}
