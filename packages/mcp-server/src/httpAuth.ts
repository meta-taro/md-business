/**
 * HTTP モードの bearer トークン認証（純ロジック）。
 * -----------------------------------------------------------------------------
 * 組み込み MCP サーバーは 127.0.0.1 のみに bind し、トランスポート内蔵の DNS リバイン
 * ディング保護（allowedHosts）を併用する。本モジュールはその上に載る最後の関門＝
 * Authorization ヘッダの bearer トークン照合だけを担い、副作用を持たない。
 */
import { timingSafeEqual } from 'node:crypto';

/**
 * `Authorization: Bearer <token>` ヘッダからトークン文字列を取り出す。
 * スキーム不一致・空トークン・ヘッダ欠如は null（＝未認証）。
 */
export function parseBearerToken(header: string | undefined): string | null {
  if (typeof header !== 'string') return null;
  const match = /^Bearer[ ]+(.+)$/.exec(header.trim());
  if (match === null) return null;
  const token = match[1]?.trim() ?? '';
  return token.length > 0 ? token : null;
}

/**
 * リクエストのトークンが期待値と一致するか。期待値が空文字のときは常に拒否
 * （トークン未設定のまま公開してしまう事故を防ぐ）。
 *
 * 比較は定数時間で行う。`===` は先頭から一致した分だけ処理時間が伸びるため、
 * 理屈のうえでは応答時間からトークンを 1 文字ずつ絞り込める。
 * `timingSafeEqual` は長さの違うバッファに例外を投げるので、長さは先に見る
 * （長さが漏れても、トークンは固定長なので絞り込みには使えない）。
 */
export function isAuthorized(header: string | undefined, expectedToken: string): boolean {
  if (expectedToken.length === 0) return false;
  const token = parseBearerToken(header);
  if (token === null) return false;
  const given = Buffer.from(token, 'utf8');
  const expected = Buffer.from(expectedToken, 'utf8');
  if (given.length !== expected.length) return false;
  return timingSafeEqual(given, expected);
}
