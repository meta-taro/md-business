import { describe, it, expect } from 'vitest';
import {
  formatSize,
  formatByteCount,
  formatModified,
  ENCODING_LABEL_KEYS,
  LINE_ENDING_LABEL_KEYS,
  GIT_STATE_LABEL_KEYS,
} from './fileInfo';
import { messages } from '../i18n/messages';

/**
 * ファイル情報（右クリック →「ファイル情報」）の表示用純ロジック。
 * 値そのものは Rust 側が測って返す。ここは見せ方だけを決める。
 */

describe('formatSize', () => {
  it('1KB 未満はバイトのまま', () => {
    expect(formatSize(0)).toBe('0 B');
    expect(formatSize(1)).toBe('1 B');
    expect(formatSize(1023)).toBe('1023 B');
  });

  it('1KB 以上は単位を繰り上げて小数 1 桁', () => {
    expect(formatSize(1024)).toBe('1.0 KB');
    expect(formatSize(1536)).toBe('1.5 KB');
    expect(formatSize(1024 * 1024)).toBe('1.0 MB');
    expect(formatSize(1024 * 1024 * 1024)).toBe('1.0 GB');
  });

  // 繰り上げの境目で「1024.0 KB」のような表示にならないこと。
  it('切り上げが単位をまたぐときは次の単位で表す', () => {
    expect(formatSize(1024 * 1024 - 1)).toBe('1.0 MB');
  });
});

describe('formatByteCount', () => {
  it('3 桁区切りで返す（正確な値を併記するため）', () => {
    expect(formatByteCount(0)).toBe('0');
    expect(formatByteCount(999)).toBe('999');
    expect(formatByteCount(1234567)).toBe('1,234,567');
  });
});

describe('formatModified', () => {
  it('日時が取れていれば年月日と時刻を含む文字列にする', () => {
    const ms = Date.UTC(2026, 7, 11, 12, 0, 0);
    // 表示は端末のタイムゾーン・ロケール依存なので、年が入ることだけ固定する
    // （12:00 UTC は時差 ±14h でも同じ年に収まる）。
    expect(formatModified(ms, 'ja')).toContain('2026');
    expect(formatModified(ms, 'en')).toContain('2026');
  });

  it('取れていなければ null（呼び出し側が「判定できません」を出す）', () => {
    expect(formatModified(null, 'ja')).toBeNull();
  });
});

describe('表示ラベルのキー', () => {
  // 文言キーを持たせただけでは、綴りを間違えても画面に出るまで気づけない
  // （辞書に無いキーはキー文字列そのものが表示される）。辞書側に実在することまで見る。
  it('文字コードのどの値も辞書にある', () => {
    for (const [encoding, key] of Object.entries(ENCODING_LABEL_KEYS)) {
      expect(messages.ja[key], encoding).toBeTruthy();
    }
  });

  it('改行コードのどの値も辞書にある', () => {
    for (const [eol, key] of Object.entries(LINE_ENDING_LABEL_KEYS)) {
      expect(messages.ja[key], eol).toBeTruthy();
    }
  });

  it('Git 管理状態のどの値も辞書にある', () => {
    for (const [state, key] of Object.entries(GIT_STATE_LABEL_KEYS)) {
      expect(messages.ja[key], state).toBeTruthy();
    }
  });

  it('値ごとに別のキーを割り当てている', () => {
    const keys = [
      ...Object.values(ENCODING_LABEL_KEYS),
      ...Object.values(LINE_ENDING_LABEL_KEYS),
      ...Object.values(GIT_STATE_LABEL_KEYS),
    ];
    // 文字コードと Git 状態で「判定できません」を共有しないよう、値ごとに独立させる。
    expect(new Set(keys).size).toBe(keys.length);
  });
});
