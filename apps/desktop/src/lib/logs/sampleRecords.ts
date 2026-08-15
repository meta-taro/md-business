/**
 * 候補を挙げるための拾い読み。
 * -----------------------------------------------------------------------------
 * どの項目が時刻かを決めるには中身が要るが、そのために全文を読むと、
 * 選ぶ前に待たされる（ログは数百 MB になりうる）。先頭の数十件だけ読む。
 *
 * 標本なので、ここで見えなかった項目は候補に出ない。それでよい——
 * 候補は打つ手間を省くためのもので、項目名は人が打てる。
 */
import {
  formatFromPath,
  readRecords,
  type LineSource,
  type ReadStats,
  type RecordFormat,
} from '@md-business/mcp-server/logs';
import { SAMPLE_RECORDS } from './fieldCandidates';

export interface SampleOk {
  ok: true;
  format: RecordFormat;
  records: Record<string, unknown>[];
  /** レコードとして読めなかった行数。 */
  skipped: number;
}

export interface SampleError {
  ok: false;
  error: string;
}

/**
 * 先頭から `limit` 件だけレコードを読む。
 *
 * 形式は拡張子から決める。判らなければ断る（推測して読み違えると、
 * 「1 件も読めない」ではなく「別のものが読めた」になり、気づけない）。
 */
export async function sampleRecords(
  source: LineSource,
  relPath: string,
  limit: number = SAMPLE_RECORDS,
  format?: RecordFormat,
): Promise<SampleOk | SampleError> {
  const resolved = format ?? formatFromPath(relPath);
  if (resolved === undefined) {
    return { ok: false, error: `形式が分かりません: ${relPath}` };
  }

  const stats: ReadStats = { skipped: 0, scannedLines: 0 };
  const records: Record<string, unknown>[] = [];
  try {
    for await (const item of readRecords(source, relPath, resolved, stats)) {
      records.push(item.record);
      // ここで抜けると読み取り側も途中で止まる（塊の続きを取りにいかない）。
      if (records.length >= limit) break;
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { ok: false, error: reason };
  }

  return { ok: true, format: resolved, records, skipped: stats.skipped };
}
