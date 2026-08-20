import { describe, expect, it } from 'vitest';
import { BATCH_MESSAGE_KEYS, batchMessage, type BatchFailureKind } from './batchMessage';
import { messages, type MessageKey } from '../i18n/messages';

const t = (key: MessageKey, values?: Record<string, string | number>): string => {
  const template = messages.ja[key];
  if (values === undefined) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const value = values[name];
    return value === undefined ? whole : String(value);
  });
};

describe('一括で書き出せない理由の文', () => {
  it('理由をひとつの文にまとめる', () => {
    expect(batchMessage({ kind: 'no-column', raw: '型番' }, t)).toBe(
      '一括で書き出せません: 表に 型番 の列がありません',
    );
  });

  it('もとになった文字列を落とさない', () => {
    expect(batchMessage({ kind: 'duplicate-name', raw: 'A-01' }, t)).toContain('A-01');
    expect(batchMessage({ kind: 'missing-font', raw: '游明朝' }, t)).toContain('游明朝');
  });

  it('どの種類にも文言がある', () => {
    for (const [kind, key] of Object.entries(BATCH_MESSAGE_KEYS)) {
      expect(messages.ja[key], kind).toBeTruthy();
      expect(batchMessage({ kind: kind as BatchFailureKind, raw: 'x' }, t)).not.toContain('{');
    }
  });
});
