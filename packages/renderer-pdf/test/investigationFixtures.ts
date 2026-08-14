import type { Investigation } from '@md-business/schema-investigation';

const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);

export function standardInvestigation(overrides: Partial<Investigation> = {}): Investigation {
  return {
    schema: 'investigation/v1',
    kind: 'log',
    documentNumber: 'INV-2026-0007',
    title: '決済 API の 502 増加についての調査',
    createdAt: '2026-08-12T09:15:00+09:00',
    status: 'concluded',
    authors: [{ name: '伊藤 太郎', role: '調査担当' }],
    reviewers: [{ name: '山田 花子', role: 'テックリード' }],
    targets: [
      { path: 'logs/api-2026-08-11.log', sha256: SHA_A, note: '本番 API の当日分' },
      { path: 'logs/gateway-2026-08-11.jsonl', sha256: SHA_B },
    ],
    tools: [
      { name: 'md-business', version: '0.9.0' },
      { name: 'jq', version: '1.7.1' },
    ],
    window: { from: '2026-08-11T00:00:00+09:00', to: '2026-08-11T23:59:59+09:00' },
    findings: [
      {
        id: 'F-01',
        summary: '上流のタイムアウトが 3 秒に縮まっていた',
        severity: 'high',
        evidence: ['evidence/EV-001.md', 'evidence/EV-002.md'],
      },
      {
        id: 'F-02',
        summary: '再送で二重に決済された取引は無い',
        severity: 'info',
        evidence: ['evidence/EV-003.md'],
      },
    ],
    summary: '502 の増加は上流のタイムアウト短縮によるもので、決済の二重計上は起きていない。',
    relatedDocs: ['docs/specs/001-payment-api.md'],
    theme: 'blue',
    ...overrides,
  };
}

/** 必須項目だけ。所見も要約もまだ無い、調査中の状態。 */
export function minimalInvestigation(overrides: Partial<Investigation> = {}): Investigation {
  return {
    schema: 'investigation/v1',
    kind: 'network',
    documentNumber: 'INV-2026-0008',
    title: '通信の切断についての調査',
    createdAt: '2026-08-13T10:00:00Z',
    status: 'investigating',
    authors: [{ name: '佐藤 次郎' }],
    targets: [{ path: 'captures/session.har', sha256: SHA_A }],
    tools: [{ name: 'md-business', version: '0.9.0' }],
    window: { from: '2026-08-13T09:00:00Z', to: '2026-08-13T09:30:00Z' },
    ...overrides,
  };
}
