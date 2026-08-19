/**
 * 開いている文書 1 枚ぶんの中身。
 *
 * タブが複数になると「編集の唯一の真実」も枚数だけ要る。並びの判定（`tabs.ts`）とは
 * 分けて、ここは「何を編集しているか」だけを持つ。作り方を関数で固定するのは、
 * 開いた直後に未保存差分が立つ・別の文書の保存時刻を引き継ぐ、といった取り違えが
 * 組み立ての場所ごとに起きるため。
 */

import type { TabRef } from './tabs';

/**
 * いま開いている画像。文書と違って本文を持たない（読むだけで、書き戻す先が無い）。
 */
export interface OpenImage {
  /** ルートからの相対パス。 */
  relPath: string;
  /** `<img src>` にそのまま入る形。 */
  dataUrl: string;
  /** `image/png` など。拡張子だけから決まる。 */
  mime: string;
  /** ファイルの大きさ（バイト）。 */
  byteSize: number;
}

export interface DocState {
  /** 編集の唯一の真実。 */
  source: string;
  /** 直近にディスクへ反映された内容。未保存差分の基準。 */
  savedSource: string;
  /** 最後に保存できた時刻（未保存なら null）。 */
  savedAt: Date | null;
  /** 保存中か（多重 save 抑止・保存インジケータ用）。 */
  saving: boolean;
  /** 画像を開いているならその中身。文書なら null。 */
  image: OpenImage | null;
  /**
   * 外部（AI/CLI/他エディタ）で変わったが、こちらに未保存編集があって自動再読込
   * できない状態。文書ごとに立つので、別のタブを見ている間も消えない。
   */
  conflict: boolean;
}

/** タブ 1 枚 = 並びの位置（`TabRef`）＋ 中身（`DocState`）。 */
export interface DocTab extends TabRef, DocState {}

/** ファイルを開いていないときの下書き（雛形を出しておくだけで、書き戻す先は無い）。 */
export function seedDoc(seed: string): DocState {
  return {
    source: seed,
    savedSource: seed,
    savedAt: null,
    saving: false,
    image: null,
    conflict: false,
  };
}

/** 読み込んだ本文で開く。開いた直後は未編集。 */
export function openedDoc(content: string): DocState {
  return seedDoc(content);
}

/** 画像で開く。本文は空にして、保存も書き出しも押せない状態にする。 */
export function imageDoc(image: OpenImage): DocState {
  return { ...seedDoc(''), image };
}
