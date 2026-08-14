/**
 * 選択セルを表示領域へ「寄せる」かどうかを決める純関数。
 * ------------------------------------------------------------------
 * 間引き（見えている範囲だけを描く）の窓は scrollTop から導かれる。そのため、人が
 * ホイールを回すだけでも窓が動き、焦点合わせの判定が走り直す。そこで毎回寄せると
 * scrollTop が書き戻され、人の操作と処理が逆向きに引き合って表示が上下に揺れる。
 *
 * 寄せてよいのは「選択が動いた」ときだけで、「窓が動いた」ときではない。両者は
 * 同じ再走として届くので、直前に寄せた選択を控えて区別する。
 *
 * もう 1 つの揺れの出どころが焦点。窓から外れた選択セルは DOM ごと消えるため、
 * 焦点がブラウザ既定の位置へ浮く。浮いたことを理由に焦点を取り戻す作りだと、
 * スクロールで選択セルが戻ってきた瞬間に表示が寄る。人がスクロールして外したぶんは
 * 「手放した」と覚えておき、選択が動くまで取り返さない。
 *
 * スクロールの揺れは実機でしか再現しないので、判断だけをここへ出して DOM 抜きで固定する。
 */

/** 呼び出し側が持ち越す状態。 */
export interface RevealState {
  /** 直前に判定した選択の鍵（`focusSpotKey` と同じ字面）。 */
  revealed: string | null;
  /** 焦点を手放したままにしている選択の鍵。手放していなければ null。 */
  releasedSpot: string | null;
}

export interface RevealInput extends RevealState {
  /** 今の選択の鍵。 */
  spot: string;
  /** その行がいま窓の中にあるか。 */
  inWindow: boolean;
}

export interface RevealPlan extends RevealState {
  /** スクロール位置を書き換えて、選択行を表示領域へ入れるか。 */
  reveal: boolean;
}

/**
 * 今回の走り直しで寄せるか、焦点を手放すかを決める。
 *
 * - 選択が動いて窓の外にある → 寄せる（Enter / 矢印で表の外へ出たとき）
 * - 選択はそのままで窓だけ動いた → 寄せない。さらに窓の外なら焦点も手放す
 * - 手放した状態は、窓へ戻ってきても選択が動くまで続く
 */
export function planRowReveal(input: RevealInput): RevealPlan {
  const { spot, inWindow, revealed, releasedSpot } = input;
  const moved = spot !== revealed;

  if (moved) return { reveal: !inWindow, revealed: spot, releasedSpot: null };

  return {
    reveal: false,
    revealed: spot,
    // 窓から外れたのは人がスクロールしたから。ここで手放し、戻ってきても取り返さない。
    releasedSpot: inWindow ? releasedSpot : spot,
  };
}
