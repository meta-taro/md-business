/**
 * 前の版と比べた本文でプレビューを組むための元を作る（DOM 非依存の純ロジック）。
 *
 * 差分は改版の印（CriticMarkup）として本文へ書き込み、いつもの描画にそのまま渡す。
 * 下線・取り消し線・余白の縦線・PDF の印刷は「印あり」と同じ経路で出るので、比較のために
 * 別の描き方を持たない。frontmatter は書式・表紙を決めるので、いまの版のものを使う
 * （版番号や日付が変わっているのは当然で、そこに印を付けても表紙が崩れるだけ）。
 */
import { compareRevisions } from '@md-business/core';

/** 先頭の frontmatter（区切りの行まで）。無ければ空文字。 */
const FRONTMATTER = /^﻿?---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/;

function split(source: string): [string, string] {
  const head = FRONTMATTER.exec(source)?.[0] ?? '';
  return [head, source.slice(head.length)];
}

export function compareSource(previous: string, current: string): string {
  const [, previousBody] = split(previous);
  const [head, currentBody] = split(current);
  return head + compareRevisions(previousBody, currentBody);
}

/**
 * 描く本文。比べる版（`previous`）が無ければいまの本文のまま。
 * プレビューと書き出しで同じ判断をするために 1 か所に置く（片方だけ比べた絵になるのを防ぐ）。
 */
export function sourceToRender(current: string, previous: string | null): string {
  return previous === null ? current : compareSource(previous, current);
}
