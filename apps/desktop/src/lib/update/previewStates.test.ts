import { describe, expect, it } from 'vitest';
import { previewStates } from './previewStates';
import type { UpdateState } from './updateFlow';

describe('previewStates', () => {
  // ダイアログが描き分ける状態は 7 つ。1 つでも見本が欠けると、その見た目だけ
  // 誰も見ないまま出ることになる。状態を足したらここが落ちる。
  it('ダイアログが描き分ける状態をすべて含む', () => {
    const expected: UpdateState['status'][] = [
      'checking',
      'up-to-date',
      'available',
      'downloading',
      'installing',
      'ready',
      'error',
    ];
    expect(previewStates().map((p) => p.state.status).sort()).toEqual([...expected].sort());
  });

  it('見本の名前は重複しない', () => {
    const labels = previewStates().map((p) => p.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  // 出てから直すには次のリリースが要る。折り返しが起きる長さで見ておきたい。
  it('更新ありの見本は、見出しと箇条書きと長い行を含む', () => {
    const found = previewStates().find((p) => p.state.status === 'available');
    const notes = found?.state.status === 'available' ? found.state.notes : '';
    expect(notes).toContain('### ');
    expect(notes).toContain('- ');
    // 全角は 2 桁ぶんの幅になるので、40 文字あればダイアログ幅では必ず折り返す。
    expect(notes.split('\n').some((line) => line.length > 40)).toBe(true);
  });

  it('失敗の見本は、実際に出る文言の長さを持つ', () => {
    const found = previewStates().find((p) => p.state.status === 'error');
    const message = found?.state.status === 'error' ? found.state.message : '';
    expect(message.length).toBeGreaterThan(20);
  });
});
