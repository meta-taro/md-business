/**
 * タイトルバー中央の表示名を組む純ロジック（田中さん要件 2026-07-22）。
 * ------------------------------------------------------------------
 * 文書種別が判るときは frontmatter / TSV メタから「意味のある名前」を組み、
 * 該当しなければファイル名（相対パス末尾）にフォールバックする。
 *
 *   請求書  → 御請求書_{請求先}{敬称}_{発行元}_{YMD}
 *   タイトル付き文書（test-spec / spec 等） → その タイトル / title
 *   TSV 検証シート → メタ タイトル
 *
 * DOM / Tauri IPC 非依存＝ここだけを単体テストする。TopBar が workspace.source を
 * 渡して呼ぶ。パース失敗（壊れた YAML 等）は throw させずファイル名へ退避する。
 */
import { splitFrontmatter } from '@md-business/core';
import { parseTsv } from '@md-business/schema-test-spec-tsv';
import { isTsvSource } from '../tsv/detect';

/** 開いている文書の source から、タイトルバーに出す表示名を決める。 */
export function documentDisplayName(source: string, fallbackFileName: string): string {
  // TSV 検証シート: メタ「タイトル」を採用（無ければファイル名）。
  if (isTsvSource(source)) {
    const title = safeTsvTitle(source);
    return title ?? fallbackFileName;
  }

  let data: Record<string, unknown>;
  try {
    data = splitFrontmatter(source).data;
  } catch {
    return fallbackFileName; // 壊れた YAML はファイル名へ退避
  }

  // 請求書はデータ駆動でタイトル項目を持たないため、専用テンプレで名前を組む。
  if (schemaId(data) === 'invoice') {
    const name = invoiceName(data);
    if (name) return name;
  }

  // タイトル / title を持つ文書（test-spec / spec ほか）はそれを表示名にする。
  const title = firstString(data['タイトル'], data['title']);
  if (title) return title;

  return fallbackFileName;
}

function safeTsvTitle(source: string): string | null {
  try {
    return nonEmpty(parseTsv(source).meta['タイトル']);
  } catch {
    return null;
  }
}

/** `schema:` / `スキーマ:` / `schemaVersion:` のいずれかから種別 ID（`/` の前）を取る。 */
function schemaId(data: Record<string, unknown>): string | null {
  const raw = firstString(data['schema'], data['スキーマ'], data['schemaVersion']);
  if (raw === null) return null;
  return raw.split('/')[0] ?? null;
}

/** 御請求書_{請求先}{敬称}_{発行元}_{YMD}。名前が全く取れなければ null（→ファイル名）。 */
function invoiceName(data: Record<string, unknown>): string | null {
  const recipient = asObject(data['recipient']) ?? asObject(data['請求先']) ?? asObject(data['宛先']);
  const issuer = asObject(data['issuer']) ?? asObject(data['発行元']);

  const recName = recipient ? firstString(recipient['name'], recipient['名前'], recipient['宛名']) : null;
  const honorific = recipient ? firstString(recipient['honorific'], recipient['敬称']) : null;
  const issName = issuer ? firstString(issuer['name'], issuer['名前']) : null;
  const ymd = toYmd(firstString(data['issueDate'], data['発行日'], data['請求日']));

  // 請求先・発行元のどちらの名前も取れないなら「意味のある名前」に至らないのでフォールバック。
  if (recName === null && issName === null) return null;

  const segments = ['御請求書'];
  if (recName !== null) segments.push(`${recName}${honorific ?? ''}`);
  if (issName !== null) segments.push(issName);
  if (ymd !== null) segments.push(ymd);
  return segments.join('_');
}

/** ISO 風日付文字列（2026-06-30 等）を YYYYMMDD へ。桁が足りなければ null。 */
function toYmd(value: string | null): string | null {
  if (value === null) return null;
  const digits = value.replace(/\D/g, '');
  return digits.length >= 8 ? digits.slice(0, 8) : null;
}

/** 与えた候補の先頭にある「空でない文字列」を返す（無ければ null）。 */
function firstString(...candidates: unknown[]): string | null {
  for (const candidate of candidates) {
    const value = nonEmpty(candidate);
    if (value !== null) return value;
  }
  return null;
}

function nonEmpty(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
