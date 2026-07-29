/**
 * サイドカーの接続情報（bearer トークン / ポート）の持ち越し。
 * -----------------------------------------------------------------------------
 * 起動のたびにトークンとポートが変わると、AI クライアント側の接続設定が毎回無効になり、
 * 利用者は起動のたびに設定を書き直すことになる。それでは実用にならないので、確定した
 * 接続情報をアプリのデータ領域へ保存し、次回以降は同じ値で立ち上げる。
 *
 * 保存先の指定は親プロセス（アプリ）が渡す。ここは「読めた文字列をどう解釈するか」
 * だけを持ち、ファイル I/O は呼び出し側に置く（判断を単体テストできる形に保つ）。
 *
 * 保存されるトークンは、ループバック上のサーバーへ接続してよい相手を絞るための合鍵。
 * 利用者のホームディレクトリ配下（本人以外が読めない領域）へ、所有者のみ読み書き可の
 * 権限で置く。漏れた疑いがあるときはファイルを消せば次回起動で作り直される。
 */

/** 保存する接続情報。 */
export interface SidecarState {
  /** bearer トークン（16 進 64 桁）。 */
  token: string;
  /** 前回確定したポート。0 は「未確定＝OS 割当に任せる」。 */
  port: number;
}

/** 発行するトークンの形（16 進 64 桁 = 32 バイト）。 */
const TOKEN_PATTERN = /^[0-9a-f]{64}$/;

/**
 * 保存されていたトークンを使い回してよいか。
 *
 * 短いトークンや推測しやすい文字列が混ざると、合鍵としての強度が保存ファイルの
 * 書き換えだけで落ちてしまう。発行時と同じ形のものだけを受け入れる。
 */
export function isReusableToken(token: unknown): token is string {
  return typeof token === 'string' && TOKEN_PATTERN.test(token);
}

/** 使い回してよいポートか（特権ポートと範囲外を除く）。 */
function isReusablePort(port: unknown): port is number {
  return typeof port === 'number' && Number.isInteger(port) && port >= 1024 && port <= 65535;
}

/** 接続情報を保存用の文字列にする（人が開いても分かるよう整形して書く）。 */
export function serializeSidecarState(state: SidecarState): string {
  return `${JSON.stringify(state, null, 2)}\n`;
}

/**
 * 保存ファイルの中身を接続情報として解釈する。読めない・形が違うものは null。
 * トークンが使えてポートだけが不正なら、ポートを 0（OS 割当）へ倒して残りを活かす。
 */
export function parseSidecarState(text: string): SidecarState | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
  const { token, port } = parsed as Record<string, unknown>;
  if (!isReusableToken(token)) return null;
  return { token, port: isReusablePort(port) ? port : 0 };
}

/** 起動時に確定した接続情報。`minted` が真なら保存し直す必要がある。 */
export interface SidecarIdentity extends SidecarState {
  /** 今回新しく発行したか（＝保存が無かった／読めなかった）。 */
  minted: boolean;
}

/**
 * 保存済みの接続情報があればそれを使い、無ければ発行する。
 * ポートは前回と同じものを希望値として返すだけで、実際に使えるかは listen 側が決める。
 */
export function resolveSidecarIdentity(
  saved: SidecarState | null,
  mintToken: () => string,
): SidecarIdentity {
  if (saved !== null) return { ...saved, minted: false };
  return { token: mintToken(), port: 0, minted: true };
}
