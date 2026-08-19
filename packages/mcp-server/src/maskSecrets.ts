/**
 * 調査結果に混ざる秘密の伏せ字化。
 * -----------------------------------------------------------------------------
 * ログ調査・通信調査のツールが返す文字列は、そのままモデルへ渡る。だから伏せ字は
 * 呼び出し側ではなくツールの内部で、返す直前にかける（呼び出し側は AI なので、
 * 忘れても誰も気づかない）。**外す引数は用意しない。** 外せる作りにすると、
 * 外したまま渡す事故が必ず起きる。生の値が要るなら人がファイルを直接開けばよい。
 *
 * 逆向きの失敗もある。全部伏せれば漏れないが、それでは調査に使えない。
 * 伏せるのは「秘密であることが名前から分かる値」と「形で判る値」に限り、
 * 隣の値・時刻・件数は残す。
 */

/** 伏せ字にした値の種別（何を隠したかを呼び出し側へ返すため）。 */
export type SecretKind =
  | 'authorization'
  | 'cookie'
  | 'token'
  | 'apiKey'
  | 'password'
  | 'email'
  | 'cardNumber';

export interface MaskResult {
  /** 伏せ字をかけたあとの文字列。行数は入力と同じ。 */
  text: string;
  /** 種別ごとの伏せた件数。1 件も無ければ空。 */
  counts: Partial<Record<SecretKind, number>>;
}

const MASK = '***';

interface Rule {
  kind: SecretKind;
  pattern: RegExp;
  /** 置き換え後の文字列。null を返すと伏せずに残し、件数にも数えない。 */
  build: (groups: (string | undefined)[]) => string | null;
  /** 名前から種別を細かく分ける（省略時は kind をそのまま使う）。 */
  refine?: (groups: (string | undefined)[]) => SecretKind;
}

/**
 * `名前: 値` / `名前=値` / `"名前": "値"` を拾う規則を作る。
 *
 * 値が引用符で囲まれていれば**その中だけ**を伏せる。行末まで潰すと、
 * 1 行 1 レコードの JSON ログではレコードごと消えて調査に使えなくなる。
 */
function keyValueRule(kind: SecretKind, key: string, unquotedValue: string): Rule {
  return {
    kind,
    // 先頭の否定後読みは、より長い語の一部（`xcookie` の `cookie` 等）に食いつかせないため。
    pattern: new RegExp(
      String.raw`(?<![\w.-])(["']?)(${key})\1(\s*[:=]\s*)(?:(["'])([^"'\r\n]*)\4|(${unquotedValue}))`,
      'gi',
    ),
    build: (g) => {
      const quote = g[4];
      const masked = quote === undefined ? MASK : `${quote}${MASK}${quote}`;
      return `${g[1]}${g[2]}${g[1]}${g[3]}${masked}`;
    },
  };
}

/** 引用符の外で値として食ってよい範囲。区切り文字と改行は含めない（行を壊さないため）。 */
const VALUE = String.raw`[^\s,;&"'}\r\n]+`;
/** Cookie は `;` 区切りで複数の値が並ぶので、引用符が無ければ行末まで伏せる。 */
const REST_OF_LINE = String.raw`[^\r\n]+`;

/** 秘密であることが名前から分かる語。名前の一部に含まれていれば伏せる（過剰側は安全側）。 */
const SECRET_KEY = String.raw`[\w.-]*(?:token|api[_-]?key|secret|password|passwd|pwd)[\w.-]*`;

const RULES: Rule[] = [
  keyValueRule('cookie', String.raw`set-cookie|cookie`, REST_OF_LINE),
  keyValueRule('authorization', String.raw`(?:proxy-)?authorization`, REST_OF_LINE),
  {
    ...keyValueRule('token', SECRET_KEY, VALUE),
    refine: (g) => {
      const name = (g[2] ?? '').toLowerCase();
      if (/api[_-]?key/.test(name)) return 'apiKey';
      if (/password|passwd|pwd/.test(name)) return 'password';
      return 'token';
    },
  },
  {
    // 局所部だけでなくドメインも残さない。顧客名簿ではドメインそのものが誰かを指す。
    kind: 'email',
    pattern: /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g,
    build: () => `${MASK}@${MASK}`,
  },
  {
    // 13〜19 桁の数字列のうち検査を通るものだけ。長い数字列を一律に潰すと
    // trace id や注文番号まで消え、ログが読めなくなる。
    kind: 'cardNumber',
    pattern: /(?<![\d-])\d(?:[ -]?\d){12,18}(?![\d-])/g,
    build: (g) => (passesLuhn((g[0] ?? '').replace(/[ -]/g, '')) ? MASK : null),
  },
];

/** クレジットカード番号のチェックディジット（区切りを除いた数字列で判定する）。 */
function passesLuhn(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

/** 名前から種別を決める。秘密の名前でなければ undefined。 */
function classifyName(name: string): SecretKind | undefined {
  const lower = name.trim().toLowerCase();
  if (/^(?:proxy-)?authorization$/.test(lower)) return 'authorization';
  if (/^(?:set-)?cookie$/.test(lower)) return 'cookie';
  if (!new RegExp(`^${SECRET_KEY}$`, 'i').test(lower)) return undefined;
  if (/api[_-]?key/.test(lower)) return 'apiKey';
  if (/password|passwd|pwd/.test(lower)) return 'password';
  return 'token';
}

export interface MaskRecordResult {
  /** 伏せ字をかけた値（入力とは別の値。入力は書き換えない）。 */
  value: unknown;
  counts: Partial<Record<SecretKind, number>>;
}

/**
 * 入れ子の深さの上限。壊れた入力や循環に近い構造で止まらないための頭打ち。
 * 実データでこの深さに達することは無いので、超えた分は文字列化して行の規則だけをかける。
 */
const MAX_DEPTH = 32;

/**
 * 解析済みの値（JSON など）を構造として歩き、秘密を伏せ字にする。
 *
 * 行単位の `maskSecrets` は「名前がキーの位置にあり、後ろに `:` か `=` が続く」形しか
 * 拾えない。調査で扱うデータには**名前が値の位置にいる**形が普通に出てくるため
 *（HAR のヘッダ配列 `{"name":"Authorization","value":"..."}` が代表例。行として読むと
 * 名前の後ろは `,` なので規則が 1 つも発火しない）、構造を歩く側でも塞ぐ。
 * どちらか一方ではなく**両方**を通す。
 *
 * `cookies` の配列だけは、名前の側から種別が分からない（`session` `sid` など付け方が自由）。
 * 入れ物の名前で Cookie だと分かるので、中の値はすべて伏せる。名前は残るので
 * 「どの Cookie が付いていたか」は読める。
 */
export function maskRecord(value: unknown): MaskRecordResult {
  const counts: Partial<Record<SecretKind, number>> = {};

  const addFrom = (from: Partial<Record<SecretKind, number>>): void => {
    for (const [kind, count] of Object.entries(from)) {
      const key = kind as SecretKind;
      counts[key] = (counts[key] ?? 0) + count;
    }
  };

  const walk = (node: unknown, depth: number, inCookies: boolean): unknown => {
    if (typeof node === 'string') {
      const masked = maskSecrets(node);
      addFrom(masked.counts);
      return masked.text;
    }
    if (node === null || typeof node !== 'object') return node;
    if (depth >= MAX_DEPTH) return walk(JSON.stringify(node) ?? '', MAX_DEPTH, false);
    if (Array.isArray(node)) return node.map((item) => walk(item, depth + 1, inCookies));

    const entries = Object.entries(node as Record<string, unknown>);
    // 名前が値の位置にいる組（`{name, value}`）。HAR のヘッダ・クエリ・Cookie 配列がこの形。
    const nameField = (node as Record<string, unknown>)['name'];
    const pairKind =
      typeof nameField === 'string' && 'value' in (node as Record<string, unknown>)
        ? (classifyName(nameField) ?? (inCookies ? 'cookie' : undefined))
        : undefined;

    const out: Record<string, unknown> = {};
    for (const [key, child] of entries) {
      const kind = key === 'value' && pairKind !== undefined ? pairKind : classifyName(key);
      if (kind !== undefined && typeof child === 'string') {
        counts[kind] = (counts[kind] ?? 0) + 1;
        out[key] = MASK;
        continue;
      }
      out[key] = walk(child, depth + 1, key.toLowerCase() === 'cookies');
    }
    return out;
  };

  return { value: walk(value, 0, false), counts };
}

/**
 * 秘密らしき値を伏せ字にする。行数は変えない（抽出結果は行番号で参照するため）。
 */
export function maskSecrets(text: string): MaskResult {
  const counts: Partial<Record<SecretKind, number>> = {};
  let out = text;

  for (const rule of RULES) {
    out = out.replace(rule.pattern, (...args) => {
      // replace のコールバック引数は [全体, 捕獲..., 位置, 元の文字列]（名前付き捕獲は使わない）。
      const groups = args.slice(0, -2) as (string | undefined)[];
      const built = rule.build(groups);
      if (built === null) return groups[0] ?? '';
      const kind = rule.refine ? rule.refine(groups) : rule.kind;
      counts[kind] = (counts[kind] ?? 0) + 1;
      return built;
    });
  }

  return { text: out, counts };
}
