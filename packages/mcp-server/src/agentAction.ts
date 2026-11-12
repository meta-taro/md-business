/**
 * 画面の中のエージェントカーソルへ頼む動作。
 * -----------------------------------------------------------------------------
 * カーソルはアプリの窓の中だけを動く絵で、OS のマウスやキーボードには触れない。
 * 対象は「画面に見えている文字」で指す。座標で指すと、窓の大きさや表示言語が
 * 変わっただけで別のものを押してしまう。
 */

export const AGENT_ACTIONS = ['point', 'click', 'type', 'go', 'say', 'filter'] as const;
export type AgentActionName = (typeof AGENT_ACTIONS)[number];

/** 吹き出しや入力値の上限。長い文は吹き出しに収まらず、読む前に消える。 */
export const AGENT_MAX_TEXT = 500;

export interface AgentAction {
  action: AgentActionName;
  /** 押す・指す対象の、画面に見えている文字。 */
  target?: string;
  /** 吹き出しに出す言葉。 */
  message?: string;
  /** 打つ値・絞り込む値。 */
  value?: string;
  /** 移る先（アプリの中の `#...` だけ）。 */
  hash?: string;
  /** 吹き出しを出しておく秒数。 */
  seconds?: number;
}

export type ParseAgentActionResult = { ok: true; agent: AgentAction } | { ok: false; error: string };

function text(v: unknown, name: string): { ok: true; value?: string } | { ok: false; error: string } {
  if (v === undefined) return { ok: true };
  if (typeof v !== 'string') return { ok: false, error: `${name} は文字で指定してください` };
  const t = v.trim();
  if (t.length > AGENT_MAX_TEXT) return { ok: false, error: `${name} は ${AGENT_MAX_TEXT} 文字までです` };
  return t === '' ? { ok: true } : { ok: true, value: t };
}

/** 外から来た入力を、アプリへ渡してよい形に揃える。渡せないものは理由を返す。 */
export function parseAgentAction(input: Record<string, unknown>): ParseAgentActionResult {
  const action = input['action'];
  if (typeof action !== 'string' || !(AGENT_ACTIONS as readonly string[]).includes(action)) {
    return { ok: false, error: `action は ${AGENT_ACTIONS.join(' / ')} のいずれかです` };
  }
  const name = action as AgentActionName;

  const target = text(input['target'], 'target');
  if (!target.ok) return target;
  const message = text(input['message'], 'message');
  if (!message.ok) return message;
  // 打つ値は空白も中身なので trim しない。長さだけ見る。
  const rawValue = input['value'];
  if (rawValue !== undefined && typeof rawValue !== 'string') {
    return { ok: false, error: 'value は文字で指定してください' };
  }
  if (typeof rawValue === 'string' && rawValue.length > AGENT_MAX_TEXT) {
    return { ok: false, error: `value は ${AGENT_MAX_TEXT} 文字までです` };
  }

  const seconds = input['seconds'];
  if (seconds !== undefined && (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 1 || seconds > 60)) {
    return { ok: false, error: 'seconds は 1〜60 の数で指定してください' };
  }

  const agent: AgentAction = { action: name };
  switch (name) {
    case 'point':
    case 'click':
      if (target.value === undefined) return { ok: false, error: `${name} には target（画面に見えている文字）が要ります` };
      agent.target = target.value;
      break;
    case 'type':
      if (target.value === undefined) return { ok: false, error: 'type には target（入力欄の見出しや案内文）が要ります' };
      if (typeof rawValue !== 'string') return { ok: false, error: 'type には value が要ります' };
      agent.target = target.value;
      agent.value = rawValue;
      break;
    case 'say':
      if (message.value === undefined) return { ok: false, error: 'say には message が要ります' };
      break;
    case 'go': {
      const hash = input['hash'];
      if (typeof hash !== 'string' || !hash.startsWith('#') || hash.length > AGENT_MAX_TEXT) {
        return { ok: false, error: 'go には # で始まる hash が要ります（アプリの外へは移りません）' };
      }
      agent.hash = hash;
      break;
    }
    case 'filter':
      agent.value = typeof rawValue === 'string' ? rawValue.trim() : '';
      break;
  }
  if (message.value !== undefined) agent.message = message.value;
  if (typeof seconds === 'number') agent.seconds = seconds;
  return { ok: true, agent };
}
