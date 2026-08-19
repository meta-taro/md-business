/**
 * 参照先シートの読み取りを控える。
 *
 * リンク（`#@ link`）・集計（`countIn`）・別シートからの選択肢（`enum(-> …)`）の 3 つは、
 * どれも「いま開いているシートのヘッダ」だけで読む相手が決まり、行の中身とは関係がない。
 * それでも 3 つとも開いている文書を見て動くので、1 文字打つたびに同じ相手を読み直していた。
 * 参照先がネットワーク越しにあると 1 回の読み取りが数百 ms かかり、打鍵のたびに待たされる。
 *
 * ここは相手のパスで控えるだけの薄い層で、読み取りそのものは引数で受け取る。
 *
 * - **読めなかったことも控える**。控えないと、置いていないファイルを指しているシートが
 *   空振りの読み取りを打鍵のたびに投げ続ける
 * - **同時の読み取りは 1 本にまとめる**。3 つの照合が同じ相手を指していると、
 *   まとめなければ 1 打で同じファイルを 3 回読む
 * - **期限を過ぎたら読み直す**。相手が別のところで書き換わっても気づけないので、
 *   控えは持ち続けない
 */
import type { SheetReader } from './linkCheck';

export interface SheetCacheOptions {
  /** 控えを捨てるまでの時間（ミリ秒）。 */
  ttlMs?: number;
  /** 時計。検査で差し替える。 */
  now?: () => number;
}

export interface SheetCache {
  /** 控えを通した読み取り。`SheetReader` としてそのまま渡せる。 */
  read: SheetReader;
  /** 控えを捨てる。開くフォルダが変わったときなど、相手ごと入れ替わる場面で呼ぶ。 */
  clear(): void;
}

/**
 * 既定の期限。自動保存の待ち時間と同じ桁に置く。長くすると隣のシートを直しても
 * こちらの照合がしばらく古いままになり、短くすると控える意味が薄れる。
 */
const DEFAULT_TTL_MS = 2000;

interface Entry {
  at: number;
  value: Promise<string | null>;
}

export function createSheetCache(read: SheetReader, options: SheetCacheOptions = {}): SheetCache {
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const now = options.now ?? (() => Date.now());
  const entries = new Map<string, Entry>();

  return {
    read(relPath: string): Promise<string | null> {
      const at = now();
      const hit = entries.get(relPath);
      if (hit !== undefined && at - hit.at < ttlMs) return hit.value;

      // 読み取りが転んだら控えを外す。転んだ結果を期限まで持つと、
      // 一度きりの失敗が「その間ずっと読めないファイル」に化ける。
      const value = read(relPath).catch(() => {
        if (entries.get(relPath)?.value === value) entries.delete(relPath);
        return null;
      });
      entries.set(relPath, { at, value });
      return value;
    },
    clear(): void {
      entries.clear();
    },
  };
}
