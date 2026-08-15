/**
 * ログを行単位で流し読みする口。
 *
 * 調査で見るログは全文を文字列にできない大きさになりうるので、
 * バイト位置を指して少しずつ取り、返ってきた位置から読み直して端まで進む。
 * 位置の付け方は Rust 側（`read_file_lines`）が決めていて、ここはその繰り返し部分だけを持つ。
 *
 * 取りに行く処理そのものは差し替えられる形にしてある。Tauri を呼ぶ側の薄い部分と、
 * 「どこまで読んだか」を進める部分を分けておくと、後者だけを単体で確かめられる。
 */

/** Rust 側 `read_file_lines` が返す 1 まとまり。 */
export interface LineChunk {
  /** 取り出した行。改行文字は含まない。 */
  lines: string[];
  /** 次に読み始めるバイト位置。 */
  nextOffset: number;
  /** ファイルの端まで読んだか。 */
  eof: boolean;
  /** 長すぎて切った行の数。 */
  truncatedLines: number;
}

/** 位置を指して塊を取る処理。 */
export type ChunkReader = (
  relPath: string,
  offset: number,
  maxLines: number,
) => Promise<LineChunk>;

/** 1 回の取得で頼む行数。応答の大きさと呼び出し回数の釣り合いで決めた既定値。 */
const CHUNK_LINES = 1_000;

export interface LineSource {
  /** 相対パスの中身を 1 行ずつ返す。 */
  lines(relPath: string): AsyncIterable<string>;
  /** 読んだ範囲で、長すぎて切られた行の数。 */
  readonly truncatedLines: number;
}

export function createLineSource(read: ChunkReader, chunkLines: number = CHUNK_LINES): LineSource {
  let truncatedLines = 0;

  return {
    get truncatedLines() {
      return truncatedLines;
    },

    async *lines(relPath: string): AsyncIterable<string> {
      let offset = 0;
      for (;;) {
        const chunk = await read(relPath, offset, chunkLines);
        truncatedLines += chunk.truncatedLines;

        for (const line of chunk.lines) yield line;

        if (chunk.eof) return;

        // 位置が進んでいないのに端でもない返答は、そのまま信じると回り続ける。
        // 画面が固まる代わりに、読めなかったこととして止める。
        if (chunk.nextOffset <= offset) {
          throw new Error(`読み取りが進みません: ${relPath} (${offset})`);
        }
        offset = chunk.nextOffset;
      }
    },
  };
}
