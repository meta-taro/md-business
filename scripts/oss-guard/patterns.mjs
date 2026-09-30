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
 * Personal handles and names are matched by SHA-256 digest rather than spelled
 * out, so that this public file does not itself publish the very names it
 * guards against.
 *
 * Pure module apart from hashing — no I/O. Consumed by the staged-diff,
 * commit-message, and whole-tree scanners in this directory.
 */

import { createHash } from 'node:crypto';

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
    re: /\bdokokade\b|\bdev-slot\d*\b/g,
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
    // Pointers into paths this repository gitignores. They resolve on the
    // author's machine but are dead links for anyone who clones the repo, so
    // published docs must explain the reason inline instead of linking out.
    // Two lookalikes are not that: `~/.claude/` is where Claude itself installs
    // on the reader's own machine, and `.claude/tools/` is tracked here, so both
    // resolve for anyone who clones. `.tmp/` needs a following path character,
    // so a bare `.tmp/` appearing as test sample data is not flagged.
    id: 'private-path-ref',
    re: /(?<!~[/\\])\.claude\/(?!tools\/)|\bCLAUDE\.md\b|\.tmp\/[\w.-]/g,
    hint: 'gitignore 済みパスへの参照',
  },
  {
    // Internal role reference in prose. NOT flagged when `PdM` is the VALUE of
    // an authors/reviewers role key (`role: 'PdM'` / `役割: PdM`) — that is
    // business-document sample data, i.e. a real-world job title, which this
    // module treats as out of scope.
    id: 'pdm-term',
    re: /(?<!(?:役割|role)\s*[:=]\s*['"「]?)\bPdM\b/g,
    hint: '内部役割呼称',
  },
];

/**
 * SHA-256 digests of personal handles (lower-cased, trailing digits removed).
 * @type {string[]}
 */
export const HANDLE_DIGESTS = [
  '3de9a38679b1d6ebaa8e3f1ca2308a339caf0a21c96c809e9545e54a3af5a815',
];

/**
 * SHA-256 digests of personal names that are flagged when followed by 「さん」.
 * A bare name stays allowed: it legitimately appears as sample document data.
 * @type {string[]}
 */
export const HONORIFIC_NAME_DIGESTS = [
  '1806496bcb753c280f934bbde21a41ad5793018726681c038da9cfc8a8c82a20',
];

/** @param {string} s */
export function digest(s) {
  return createHash('sha256').update(s).digest('hex');
}

/**
 * Hashed-word matchers. Each yields candidate substrings of a line; a candidate
 * whose digest is in the set is reported.
 * @type {{ id: string, hint: string, key: 'handles' | 'honorific', candidates: (line: string) => { matched: string, index: number, word: string }[] }[]}
 */
const HASHED = [
  {
    id: 'internal-handle',
    hint: '内部リポ/担当ハンドル',
    key: 'handles',
    candidates(line) {
      const out = [];
      for (const m of line.matchAll(/[A-Za-z][A-Za-z0-9-]*/g)) {
        // A handle may be embedded in a longer hyphenated account name.
        for (const part of m[0].split('-')) {
          const word = part.toLowerCase().replace(/\d+$/, '');
          if (word) out.push({ matched: m[0], index: m.index, word });
        }
      }
      return out;
    },
  },
  {
    id: 'pdm-honorific',
    hint: '内部担当者への言及',
    key: 'honorific',
    candidates(line) {
      const out = [];
      for (const m of line.matchAll(/([\u4E00-\u9FFF]{1,6})さん/g)) {
        // Try every suffix so a preceding kanji word does not hide the name.
        for (let k = 0; k < m[1].length; k++) {
          out.push({ matched: m[0], index: m.index, word: m[1].slice(k) });
        }
      }
      return out;
    },
  },
];

/**
 * Scan a block of text and return every internal-reference match.
 *
 * @param {string} text
 * @param {{ allow?: string[], digests?: { handles?: string[], honorific?: string[] } }} [options]
 *   allow — literal strings that waive a finding when they equal either the
 *   matched substring or the trimmed line. digests — replaces the built-in
 *   digest lists (tests use it to avoid spelling out real names).
 * @returns {{ patternId: string, hint: string, matched: string, line: number, col: number, text: string }[]}
 */
export function scanText(text, options = {}) {
  const allow = new Set((options.allow ?? []).map((s) => s.trim()).filter(Boolean));
  const digests = {
    handles: new Set(options.digests?.handles ?? HANDLE_DIGESTS),
    honorific: new Set(options.digests?.honorific ?? HONORIFIC_NAME_DIGESTS),
  };
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

    for (const h of HASHED) {
      const seen = new Set();
      for (const c of h.candidates(line)) {
        if (seen.has(c.index) || !digests[h.key].has(digest(c.word))) continue;
        seen.add(c.index);
        if (allow.has(c.matched)) continue;
        findings.push({
          patternId: h.id,
          hint: h.hint,
          matched: c.matched,
          line: i + 1,
          col: c.index + 1,
          text: trimmed,
        });
      }
    }
  }

  return findings;
}
