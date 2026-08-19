/**
 * プレビューを組み直すかどうかの判定。
 *
 * 右ペインは 6 つの見せ方を入れ替えて使う（時系列・差分・参考データ・検証グリッド・画像・プレビュー）。
 * プレビューは本文全体を HTML へ組み直して作るため、出していないときに組み直すと
 * 丸ごと捨てるだけの作業になる。判定を画面側の条件式に散らすと並び順ひとつで戻るので、
 * ここへ出して固定する。
 */

/** 右ペインがいま何を出しているか。 */
export interface PaneState {
  /** 差分表示に切り替えている。 */
  diff: boolean;
  /** 参考データ（.json / .xml）を出している。 */
  data: boolean;
  /** 検証グリッドを出している。 */
  grid: boolean;
  /** 時系列を出している。 */
  timeline: boolean;
  /** 画像を出している。 */
  image: boolean;
}

/** プレビューが画面に出るか。ほかの見せ方が 1 つでも出ていれば出ない。 */
export function previewVisible(pane: PaneState): boolean {
  return !pane.diff && !pane.data && !pane.grid && !pane.timeline && !pane.image;
}

/**
 * プレビューが使える状態か。**出していないときは組み上がりを確かめない。**
 *
 * 確かめること自体が本文全体の組み直しを呼ぶため、確かめ方を関数で受け取り、
 * 画面に出しているときだけ呼ぶ。並び順に頼らず、呼ばないことを型で示す。
 */
export function previewReady(pane: PaneState, isOk: () => boolean): boolean {
  return previewVisible(pane) && isOk();
}

/**
 * プレビューを組み直すか。
 *
 * 組み立て一式は、プレビューを出す面になった時点で読み込まれ、そのあと面を切り替えても
 * 読み込まれたまま残る。残っているだけで組み直しが動くと、検証グリッドで 1 文字打つたびに
 * 誰も見ない HTML を本文全体から組み直すことになる。出していない面では組み直さない。
 */
export function shouldRenderPreview(pane: PaneState): boolean {
  return previewVisible(pane);
}
