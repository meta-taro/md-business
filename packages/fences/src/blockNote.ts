/**
 * 囲みを描けなかったときの見せ方を、ひとところに決める。
 *
 * 黙って空にしない。空にすると、書いた本人にも何を書いたのか分からなくなる。理由を
 * 囲みのあった位置に出し、書いた指定はそのまま残す。図でも表でも同じ形にしたいので、
 * 決めるのはここ 1 か所だけにする。
 */

/** 理由は引用として出す。改行が入ると引用が切れるので 1 行に畳む。 */
export function blockNote(reason: string): string {
  return `> ${reason.replace(/\s*\n\s*/g, ' ')}`;
}

/** 理由のあとに、書かれていたものをそのまま置く。 */
export function blockFailure(reason: string, raw: string): string {
  return `${blockNote(reason)}\n\n${raw}`;
}
