import { describe, expect, it } from 'vitest';
import { describeChartProblem, describeDataProblem } from '../src/describe.js';

describe('describeChartProblem', () => {
  it('says the chart could not be drawn and where', () => {
    expect(describeChartProblem({ kind: 'unknown-key', raw: 'colour', line: 3 })).toBe(
      '図を描けません。3 行目: 知らない指定です（colour）。',
    );
  });

  it('omits the line when it is unknown', () => {
    expect(describeChartProblem({ kind: 'read-failed', raw: 'a.tsv', line: null })).toBe(
      '図を描けません。表を読めません（a.tsv）。',
    );
  });

  it('does not open with "could not draw" when the chart was drawn', () => {
    expect(describeChartProblem({ kind: 'unreadable-cells', raw: '2', line: null })).toBe(
      '数として読めないセルが 2 個ありました。その分は図では空けてあります。',
    );
  });
});

describe('describeDataProblem', () => {
  it('says the table could not be built and where', () => {
    expect(describeDataProblem({ kind: 'missing', raw: 'source', line: null })).toBe(
      'データを表にできません。指定が足りません（source）。',
    );
    expect(describeDataProblem({ kind: 'syntax', raw: 'x', line: 2 })).toBe(
      'データを表にできません。2 行目: この行が `名前: 値` の形になっていません（x）。',
    );
  });
});
