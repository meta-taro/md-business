// Issuer-seal (印影) SVG generator.
//
// Generates a self-contained SVG <svg> tag for inline embedding in the
// invoice template. No raster fonts are bundled — the renderer relies on
// the host page's fonts.css (alias family `MdBusiness Stamp`, fork-friendly
// swap-point for tensho / kaisho in custom builds).

const STAMP_RED = '#c8161d';

const CORPORATE_KEYWORDS = [
  '株式会社',
  '有限会社',
  '合同会社',
  '合名会社',
  '合資会社',
];

const CORPORATE_PAREN_RE = /[(（][株有合名資][)）]/;
const CORPORATE_GLYPH_RE = /[㈱㈲㈳㈴㈵㈶㈷㈸㈹]/;

const CJK_RE = /[　-鿿＀-￯]/;

export type StampShape = 'round' | 'square';
export type StampShapeRequest = 'auto' | 'round' | 'square' | 'off';

export interface RenderStampOptions {
  text: string;
  shape?: StampShapeRequest;
  font?: string;
  sizeMm?: number;
}

export interface StampSvg {
  shape: StampShape;
  svg: string;
}

export function inferStampShape(text: string): StampShape {
  if (CORPORATE_KEYWORDS.some((k) => text.includes(k))) return 'square';
  if (CORPORATE_PAREN_RE.test(text)) return 'square';
  if (CORPORATE_GLYPH_RE.test(text)) return 'square';
  return 'round';
}

export function extractStampChars(name: string, max = 4): string[] {
  let cleaned = name;
  for (const kw of CORPORATE_KEYWORDS) {
    cleaned = cleaned.split(kw).join('');
  }
  cleaned = cleaned
    .replace(CORPORATE_PAREN_RE, '')
    .replace(CORPORATE_GLYPH_RE, '')
    .trim();
  // Array.from handles surrogate pairs correctly.
  return Array.from(cleaned).slice(0, max);
}

interface CjkGlyph {
  x: number;
  y: number;
  size: number;
  char: string;
}

// Layout follows the conventional reading order of Japanese seals:
// top-right -> bottom-right -> top-left -> bottom-left (column-major, R-to-L).
function layoutCjk(chars: string[]): CjkGlyph[] {
  const n = chars.length;
  if (n >= 4) {
    return [
      { x: 68, y: 46, char: chars[0]!, size: 26 },
      { x: 68, y: 82, char: chars[1]!, size: 26 },
      { x: 32, y: 46, char: chars[2]!, size: 26 },
      { x: 32, y: 82, char: chars[3]!, size: 26 },
    ];
  }
  if (n === 3) {
    return [
      { x: 50, y: 34, char: chars[0]!, size: 22 },
      { x: 50, y: 58, char: chars[1]!, size: 22 },
      { x: 50, y: 82, char: chars[2]!, size: 22 },
    ];
  }
  if (n === 2) {
    return [
      { x: 50, y: 46, char: chars[0]!, size: 34 },
      { x: 50, y: 82, char: chars[1]!, size: 34 },
    ];
  }
  return [{ x: 50, y: 68, char: chars[0] ?? '', size: 52 }];
}

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '&':
        return '&amp;';
      case "'":
        return '&apos;';
      case '"':
        return '&quot;';
      default:
        return c;
    }
  });
}

const DEFAULT_FONT =
  '"MdBusiness Stamp", "Noto Serif JP", "Yu Mincho", "Hiragino Mincho ProN", serif';

export function renderStampSvg(options: RenderStampOptions): StampSvg | null {
  const { text, shape: shapeReq = 'auto', font, sizeMm = 24 } = options;
  if (shapeReq === 'off') return null;
  const chars = extractStampChars(text);
  if (chars.length === 0) return null;

  const shape: StampShape =
    shapeReq === 'round' || shapeReq === 'square' ? shapeReq : inferStampShape(text);
  const fontFamily = font ?? DEFAULT_FONT;
  const fontAttr = escapeXml(fontFamily);
  const isCjkText = CJK_RE.test(chars.join(''));

  const frame =
    shape === 'round'
      ? `<circle cx="50" cy="50" r="46" fill="none" stroke="${STAMP_RED}" stroke-width="3.5" />`
      : `<rect x="4" y="4" width="92" height="92" fill="none" stroke="${STAMP_RED}" stroke-width="3.5" />\n  <rect x="9" y="9" width="82" height="82" fill="none" stroke="${STAMP_RED}" stroke-width="1.2" />`;

  let glyphs: string;
  if (isCjkText) {
    glyphs = layoutCjk(chars)
      .map(
        (g) =>
          `<text x="${g.x}" y="${g.y}" text-anchor="middle" font-size="${g.size}" fill="${STAMP_RED}" font-family="${fontAttr}" font-weight="900">${escapeXml(g.char)}</text>`,
      )
      .join('\n  ');
  } else {
    // Latin text: single centered row, font-size shrinks for longer strings.
    const joined = chars.join('').toUpperCase();
    const fontSize = Math.max(10, Math.min(30, 240 / joined.length));
    glyphs = `<text x="50" y="62" text-anchor="middle" font-size="${fontSize}" fill="${STAMP_RED}" font-family="${fontAttr}" font-weight="900" letter-spacing="1.5">${escapeXml(joined)}</text>`;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${sizeMm}mm" height="${sizeMm}mm" class="mdb-stamp mdb-stamp--${shape}" role="img" aria-label="印影">
  ${frame}
  ${glyphs}
</svg>`;

  return { shape, svg };
}
