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
