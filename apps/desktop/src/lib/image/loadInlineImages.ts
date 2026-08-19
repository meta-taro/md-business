/**
 * 本文が指している画像を読み集める。
 *
 * 参照を数え上げるところと、読んだものを本文へ埋めるところは純関数（inlineImages.ts）。
 * ここは「どこから読むか」だけを受け取り、読み取りの中身は呼ぶ側に任せる
 * （画面では Tauri 側の読み取り、試験では作り物を渡す）。
 */
import { collectImageRefs, resolveImagePath } from './inlineImages';

/** 開いているフォルダから見たパスを渡すと data URL を返す読み取り。 */
export type ReadImage = (relPath: string) => Promise<string>;

/** 出せなかった画像と、その理由。 */
export interface InlineImageFailure {
  ref: string;
  message: string;
}

export interface InlineImages {
  /** 本文に書かれたままの参照 → data URL。 */
  urls: Map<string, string>;
  /** 読めなかったもの。黙って消さずに数と理由を残す。 */
  failures: InlineImageFailure[];
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function loadInlineImages(
  source: string,
  docPath: string,
  read: ReadImage,
): Promise<InlineImages> {
  const urls = new Map<string, string>();
  const failures: InlineImageFailure[] = [];
  const targets = collectImageRefs(source)
    .map((image) => ({ image, path: resolveImagePath(docPath, image.ref) }))
    .filter((target): target is { image: { raw: string; ref: string }; path: string } =>
      // 解決できない参照は読みにいかない（フォルダの外へ出るもの）。
      target.path !== null,
    );

  await Promise.all(
    targets.map(async ({ image, path }) => {
      try {
        urls.set(image.raw, await read(path));
      } catch (error: unknown) {
        failures.push({ ref: image.ref, message: messageOf(error) });
      }
    }),
  );
  return { urls, failures };
}
