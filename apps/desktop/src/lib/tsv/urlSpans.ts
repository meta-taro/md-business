/**
 * 自由文のセルの中から URL を切り出す（純粋な層）。
 *
 * `url` 型の列は既にセルまるごとがリンクになる（{@link followableLink}）。困るのは
 * **手順や備考の文中に URL が書いてある**ときで、これはセル全体では URL にならないので
 * 押せない。選んで写して貼る、を毎回やることになる。
 *
 * 走らせるのは**描画のときだけ**にする。セルを 1 つ確定するたびに全行を走査すると、
 * 行数ぶんの解析が編集のたびに走る。見えている行だけを描く作りなので、描画時なら
 * 窓の中の行数で収まる。
 *
 * 見るのは `http` / `https` だけ。読めても追えない指し先を押せる形にすると、押しても
 * 何も起きないリンクになり、壊れているのと区別がつかない。
 */

/** 切り出した 1 区間。`url` が null なら普通の文字。 */
export interface UrlSpan {
  /** 表示する文字列。 */
  text: string;
  /** 押したときの行き先。普通の文字なら null。 */
  url: string | null;
}

/**
 * URL の始まり。直前が英数字のときは拾わない（`xhttps://…` のような語の途中）。
 */
const START = /(^|[^0-9A-Za-z])(https?:\/\/)/g;

/**
 * URL に使える字。空白と非 ASCII はここで終わる。
 *
 * 日本語がすぐ続く書き方（`https://example.com/xを開く`）は珍しくない。非 ASCII を
 * 含めないので、そこが終わりになる。
 */
const URL_CHAR = /[0-9A-Za-z\-._~:/?#[\]@!$&'()*+,;=%]/;

/** 末尾に付いていたら URL から外す字（文の区切りとして書かれたもの）。 */
const TRAILING = new Set([...'.,;:!?'.split(''), ...'\'"'.split('')]);

/**
 * 末尾の句読点・閉じ括弧を落とす。
 *
 * 括弧は数を見る。`(b)` のように中で対になっているものは URL の一部なので残し、
 * `(https://…)` のように囲っただけのものは落とす。
 */
function trimTail(url: string): string {
  let end = url.length;
  while (end > 0) {
    const last = url[end - 1] ?? '';
    if (TRAILING.has(last)) {
      end -= 1;
      continue;
    }
    if (last === ')' || last === ']') {
      const open = last === ')' ? '(' : '[';
      const body = url.slice(0, end);
      const opened = body.split(open).length - 1;
      const closed = body.split(last).length - 1;
      if (closed > opened) {
        end -= 1;
        continue;
      }
    }
    break;
  }
  return url.slice(0, end);
}

/** scheme の後ろに中身があるか（`https://` だけを URL にしない）。 */
function hasHost(url: string): boolean {
  const slashes = url.indexOf('//');
  return url.length > slashes + 2;
}

/** 文字列を、普通の文字と URL の区間へ切り分ける。 */
export function splitUrlSpans(text: string): UrlSpan[] {
  const spans: UrlSpan[] = [];
  let at = 0;
  START.lastIndex = 0;
  let found: RegExpExecArray | null;
  while ((found = START.exec(text)) !== null) {
    const start = found.index + (found[1] ?? '').length;
    let end = start;
    while (end < text.length && URL_CHAR.test(text[end] ?? '')) end += 1;
    const url = trimTail(text.slice(start, end));
    if (!hasHost(url)) {
      // 進めておかないと同じ位置で止まる（scheme だけの書き方が続くとき）。
      START.lastIndex = start + 1;
      continue;
    }
    if (start > at) spans.push({ text: text.slice(at, start), url: null });
    spans.push({ text: url, url });
    at = start + url.length;
    START.lastIndex = at;
  }
  if (at < text.length) spans.push({ text: text.slice(at), url: null });
  return spans;
}

/** 文中に URL があるか（切り分ける前の当たり判定）。 */
export function hasUrl(text: string): boolean {
  return splitUrlSpans(text).some((span) => span.url !== null);
}
