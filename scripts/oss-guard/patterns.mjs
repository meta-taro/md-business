/**
 * Internal-reference denylist for open-source hygiene.
 *
 * Flags text that would leak internal operating context into published files
 * or commit messages: author-attributed dated comments, internal role/handle
 * terms, and internal rule-section pointers. Published source should read as
 * self-contained — it should explain *what the code does*, not *who asked for
 * it* or *which private process governs it*.
 *
 * Out of scope: business-document SAMPLE data (names inside md/tsv data cells).
 * Patterns target operating references (role terms, dated attribution, private
 * handles), not arbitrary personal names that legitimately appear as document
 * content. Legitimate matches elsewhere can be waived via an allowlist entry.
 *
 * Pure module — no I/O. Consumed by the staged-diff, commit-message, and
 * whole-tree scanners in this directory.
 */

/** @typedef {{ id: string, re: RegExp, hint: string }} Pattern */

/** @type {Pattern[]} */
export const PATTERNS = [
  {
    id: 'internal-role',
    re: /司令塔|伝書鳩/g,
    hint: '内部運用ロール用語',
  },
  {
    // "baseline §6" / "baseline 項目5" / "Baseline 1" — pointers into a private
    // rulebook. Requires baseline to be *followed by* a section marker or digit
    // so the CSS keyword `baseline` (align-items / vertical-align) never trips.
    id: 'internal-rule-ref',
    re: /baseline\s*[§項\d]/gi,
    hint: '内部ルールのセクション参照',
  },
  {
    id: 'internal-handle',
    re: /\bdokokade\b|\bs-yoko-dokokade\b|\bkajiwara\d*\b|\bdev-slot\d*\b/g,
    hint: '内部リポ/担当ハンドル',
  },
  {
    // Dated author attribution, e.g. "…依頼 2026-07-22". A commit history and
    // git blame already carry authorship; comments should not restate it.
    id: 'author-attribution',
    re: /(?:依頼|指示|作成|修正|対応)\s*20\d\d-\d\d-\d\d/g,
    hint: '日付つき作業者帰属コメント',
  },
  {
    id: 'pdm-honorific',
    re: /田中さん/g,
    hint: '内部担当者への言及',
  },
  {
    id: 'pdm-term',
    re: /\bPdM\b/g,
    hint: '内部役割呼称',
  },
];

/**
 * Scan a block of text and return every internal-reference match.
 *
 * @param {string} text
 * @param {{ allow?: string[] }} [options] allow — literal strings that waive a
 *   finding when they equal either the matched substring or the trimmed line.
 * @returns {{ patternId: string, hint: string, matched: string, line: number, col: number, text: string }[]}
 */
export function scanText(text, options = {}) {
  const allow = new Set((options.allow ?? []).map((s) => s.trim()).filter(Boolean));
  const findings = [];
  const lines = String(text).split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (allow.has(trimmed)) continue;

    for (const p of PATTERNS) {
      p.re.lastIndex = 0;
      let m;
      while ((m = p.re.exec(line)) !== null) {
        const matched = m[0];
        // Guard against a zero-length match spinning the loop forever.
        if (m.index === p.re.lastIndex) p.re.lastIndex++;
        if (allow.has(matched)) continue;
        findings.push({
          patternId: p.id,
          hint: p.hint,
          matched,
          line: i + 1,
          col: m.index + 1,
          text: trimmed,
        });
      }
    }
  }

  return findings;
}
