import { findInternalBlocks, findSubmissionLeaks, type DocumentEdition } from '@md-business/core';

/**
 * 提出版に残ると困るもの（ソースの場所・コミットのハッシュ）と、閉じ忘れた社内の囲みを知らせる。
 *
 * 書き出しは止めない。用語集に正当なハッシュを載せる文書もあるので、見つけたものを
 * 見せて判断は書いた人に任せる。社内版は全部載せるのが正しいので何も言わない。
 */

/** 警告欄を見つけたもので埋め尽くさないための上限。 */
const MAX_LEAKS = 5;

export function editionWarnings(body: string, edition: DocumentEdition): string[] {
  if (edition !== 'submission') return [];

  const warnings: string[] = [];
  if (findInternalBlocks(body).some((block) => !block.closed)) {
    warnings.push(
      '社内の囲み（::: 社内）が閉じていません。提出版では囲みから文末までが消えます。',
    );
  }

  const leaks = findSubmissionLeaks(body);
  for (const leak of leaks.slice(0, MAX_LEAKS)) {
    const what = leak.kind === 'source-location' ? 'ソースの場所' : 'コミットのハッシュらしき文字列';
    warnings.push(
      `提出版に${what}「${leak.text}」が残っています。社内向けなら ::: 社内 〜 ::: で囲んでください。`,
    );
  }
  if (leaks.length > MAX_LEAKS) {
    warnings.push(`ほか ${leaks.length - MAX_LEAKS} 件、提出版に残っている箇所があります。`);
  }
  return warnings;
}
