/**
 * 図の軸・目盛り・文字の色。
 *
 * 図は画像として貼るので、貼り先とは別の文書になる。文字色も書体も継がないため、
 * ここから明示して渡す。値は本文の文字色（`markdownFallback.ts` の `--md-fg`）に合わせる。
 */
export const CHART_INK = { light: '#1f2328', dark: '#e6edf3' } as const;
