export { collectFencedBlocks, replaceFencedBlocks } from './fencedBlocks.js';
export type { FencedBlock } from './fencedBlocks.js';
export { blockNote, blockFailure } from './blockNote.js';
export { resolveRelPath } from './relPath.js';

export type { ChartBlock } from './chart/chartBlocks.js';
export { collectChartBlocks, replaceChartBlocks } from './chart/chartBlocks.js';
export { parseDataTable, buildChartData } from './chart/chartData.js';
export type { ChartData, DataTable, ChartDataProblemKind } from './chart/chartData.js';
export { CHART_INK } from './chart/chartInk.js';
export { parseChartSpec } from './chart/chartSpec.js';
export type { ChartSpec, ChartType, ChartProblemKind } from './chart/chartSpec.js';
export { renderChartSvg } from './chart/chartSvg.js';
export { loadCharts } from './chart/loadCharts.js';
export type { ChartLoadKind, ChartLoadProblem, LoadChartsOptions } from './chart/loadCharts.js';

export type { DataBlock } from './data/dataBlocks.js';
export { collectDataBlocks, replaceDataBlocks } from './data/dataBlocks.js';
export { parseDataSpec } from './data/dataSpec.js';
export type { DataSpec, DataProblemKind } from './data/dataSpec.js';
export { toMarkdownTable, toDataScript } from './data/dataTable.js';
export { loadDataBlocks } from './data/loadData.js';
export type { DataLoadKind, DataLoadProblem, LoadDataOptions } from './data/loadData.js';

export { describeChartProblem, describeDataProblem } from './describe.js';
