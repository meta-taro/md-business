import { describe, it, expect } from 'vitest';
import { renderInvestigationFileName } from '../src/index.js';
import type { Investigation } from '../src/index.js';

const SHA = 'c'.repeat(64);

const investigation: Investigation = {
  schema: 'investigation/v1',
  kind: 'log',
  documentNumber: 'INV-2026-001',
  title: 'ログイン失敗の急増',
  createdAt: '2026-08-12T09:30:00+09:00',
  status: 'investigating',
  authors: [{ name: '田中' }],
  targets: [{ path: 'logs/app.jsonl', sha256: SHA }],
  tools: [{ name: 'md-business mcp-server', version: '0.9.0' }],
  window: { from: '2026-08-11T00:00:00+09:00', to: '2026-08-12T00:00:00+09:00' },
};

describe('renderInvestigationFileName', () => {
  it('falls back to the default rule when no template is given', () => {
    expect(renderInvestigationFileName(investigation)).toBe('調査報告書_INV-2026-001');
  });

  it('falls back when the template is blank', () => {
    expect(renderInvestigationFileName(investigation, '   ')).toBe('調査報告書_INV-2026-001');
  });

  it.each([
    ['{文書番号}', 'INV-2026-001'],
    ['{documentNumber}', 'INV-2026-001'],
    ['{タイトル}', 'ログイン失敗の急増'],
    ['{title}', 'ログイン失敗の急増'],
    ['{種別}', 'log'],
    ['{kind}', 'log'],
    ['{状態}', 'investigating'],
    ['{status}', 'investigating'],
    ['{作成日}', '2026-08-12'],
    ['{createdDate}', '2026-08-12'],
    ['{作成日YMD}', '20260812'],
  ])('substitutes %s', (template, expected) => {
    expect(renderInvestigationFileName(investigation, template)).toBe(expected);
  });

  it('tolerates spaces inside a token', () => {
    expect(renderInvestigationFileName(investigation, '{ 文書番号 }')).toBe('INV-2026-001');
  });

  it('drops unknown tokens', () => {
    expect(renderInvestigationFileName(investigation, 'A{未知}B')).toBe('AB');
  });

  it('replaces characters Windows refuses in a file name', () => {
    const withSlash = { ...investigation, title: 'a/b:c*d?e"f<g>h|i' };
    expect(renderInvestigationFileName(withSlash, '{タイトル}')).toBe('a_b_c_d_e_f_g_h_i');
  });

  it('trims leading and trailing separators', () => {
    expect(renderInvestigationFileName(investigation, '_{文書番号}_')).toBe('INV-2026-001');
  });

  it('renders {YMD} and {date} as today', () => {
    const ymd = renderInvestigationFileName(investigation, '{YMD}');
    const iso = renderInvestigationFileName(investigation, '{date}');
    expect(ymd).toMatch(/^\d{8}$/);
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(iso.replace(/-/g, '')).toBe(ymd);
  });
});
