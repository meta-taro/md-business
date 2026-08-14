/**
 * ログを扱う層だけの入口。
 *
 * MCP サーバー本体（`index.ts`）は SDK・スキーマ一式を連れてくるので、
 * ログを組み立てたいだけの相手（デスクトップアプリ）がそこから読むと、
 * 使わないものまで抱えることになる。ここは時系列の組み立てと、
 * そのために要る型だけを出す。
 *
 * ここから先が触るのは「1 行ずつ読めること」だけ（`LineSource`）。
 * 読み書き一式は要らない。
 */
export { buildTimeline } from './timeline.js';
export type {
  BuildTimelineInput,
  BuildTimelineOk,
  TimelineEvent,
  TimelineSource,
  TimelineSourceStat,
} from './timeline.js';

/**
 * 中身を覗くための口。
 *
 * どの項目を時刻にするかは、ファイルを開く前には決まらない。組み立てる側と
 * 別の読み方をすると、画面で選んだ項目が組み立てでは読めない、が起きる。
 */
export { formatFromPath, pick, readRecords, toText } from './recordSource.js';
export type { ReadStats, RecordFormat, SourceRecord } from './recordSource.js';
export { parseTimestamp } from './timestamps.js';
export type { EpochUnit, Timestamp } from './timestamps.js';

export type { LineSource } from './store.js';
export type { ToolError } from './tools.js';
