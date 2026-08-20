/**
 * 表の上の補足行を畳むかどうか（純粋な層）。
 *
 * 補足が何本もあるシートは、開いた時点で画面の上半分が補足で埋まる。実施中の人は
 * もう読み終わっているので、**既定は畳んでいるほうが正しい**。ただし畳むかどうかは
 * シートごとに違う（3 本でも毎回読ませたいシートはある）ので、選んだら覚える。
 *
 * 覚える先（localStorage）はここには持たない。読んだ生値と本数を渡せば答えが出る形にして、
 * 保存できない環境でも既定で動くようにする。
 */

/** 何本から既定で畳むか。 */
export const NOTE_FOLD_MIN = 4;

/** 覚えている値の綴り（保存先に残る文字列なので、意味の読める語にする）。 */
const FOLDED = 'folded';
const OPEN = 'open';

/** 何も覚えていないときに畳むか。 */
export function foldsByDefault(noteCount: number): boolean {
  return noteCount >= NOTE_FOLD_MIN;
}

/** 覚える先の名前。シートごとに分ける。 */
export function noteFoldKey(sheetPath: string): string {
  return `mdb.grid.noteFold:${sheetPath}`;
}

/**
 * 畳むかを決める。覚えていればそれに従い、無ければ本数で決める。
 *
 * 覚えた値を本数より優先するのは、畳む／開くが利用者の選択だから。本数が変わるたびに
 * 選択が消えると、補足を 1 本足すだけで畳み直されることになる。
 */
export function resolveNoteFold(noteCount: number, stored: string | null): boolean {
  if (stored === OPEN) return false;
  if (stored === FOLDED) return true;
  return foldsByDefault(noteCount);
}

/** 覚えるときの綴りにする。 */
export function noteFoldValue(folded: boolean): string {
  return folded ? FOLDED : OPEN;
}
