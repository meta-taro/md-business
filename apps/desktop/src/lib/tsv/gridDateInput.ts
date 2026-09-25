/**
 * 日付・日時の入力欄（input type=date / datetime-local）の上限。
 * ------------------------------------------------------------------
 * max を置かない入力欄は年を 6 桁まで受け付けるため、年を打っても月の欄へ
 * 進まず、どこまで打てばよいか分からなくなる。年 4 桁の最終時刻を上限にすると
 * 年の欄が 4 桁で止まる。
 */

/** 入力欄の種類。 */
export type DateInputKind = 'date' | 'datetime';

/** 入力欄の max 属性に渡す値（入力欄の書式に合わせる）。 */
export function dateInputMax(kind: DateInputKind): string {
  return kind === 'date' ? '9999-12-31' : '9999-12-31T23:59';
}
