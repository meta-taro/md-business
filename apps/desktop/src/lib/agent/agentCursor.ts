/**
 * エージェント用のカーソル。窓の中にだけ重ねる絵で、利用者のマウスやキーボードは奪わない。
 *
 * AI が「ここです」と指したり、押してみせたり、吹き出しで話したりするための層。
 * 依頼は 1 つずつ順に動かす（並べて動かすと、どれを指しているのか人から追えない）。
 * 何かできなかったときは、依頼元が次の手を決められる言葉で返す。
 */
import { findTarget, isVisible } from './findTarget';
import { bubbleAnchor, bubblePlacement, bubbleShowMs, type Rect } from './placement';

export const AGENT_ACTIONS = ['point', 'click', 'type', 'go', 'say', 'filter'] as const;
export type AgentActionName = (typeof AGENT_ACTIONS)[number];

export interface AgentAction {
  action: AgentActionName;
  target?: string;
  message?: string;
  value?: string;
  hash?: string;
  seconds?: number;
}

export type AgentResult = { ok: true } | { ok: false; error: string };

/** カーソルが動いて止まるまで。CSS の transition と揃える。 */
const MOVE_MS = 650;
/** 何もしない時間がこれだけ続いたらカーソルを引っ込める。 */
const IDLE_HIDE_MS = 6000;
/** 指した場所を囲む枠を出しておく時間。 */
const HIGHLIGHT_MS = 2600;
/** 吹き出しから指が離れたあと、閉じるまでの猶予。 */
const HOVER_GRACE_MS = 1500;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseAgent(raw: unknown): { ok: true; agent: AgentAction } | { ok: false; error: string } {
  if (!isRecord(raw) || typeof raw['action'] !== 'string') {
    return { ok: false, error: '動作が指定されていません' };
  }
  const action = raw['action'];
  if (!(AGENT_ACTIONS as readonly string[]).includes(action)) {
    return { ok: false, error: `知らない動作です: ${action}` };
  }
  const agent: AgentAction = { action: action as AgentActionName };
  for (const key of ['target', 'message', 'value', 'hash'] as const) {
    const value = raw[key];
    if (typeof value === 'string') agent[key] = value;
  }
  const seconds = raw['seconds'];
  if (typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0) agent.seconds = seconds;
  return { ok: true, agent };
}

const STYLE = `
[data-agent-overlay]{position:fixed;inset:0;pointer-events:none;z-index:60}
[data-agent-cursor]{position:fixed;left:0;top:0;width:24px;height:24px;transition:transform .65s cubic-bezier(.3,.7,.2,1),opacity .3s;filter:drop-shadow(0 2px 3px rgba(0,0,0,.35));z-index:60}
[data-agent-cursor] svg{display:block}
[data-agent-tag]{position:absolute;left:18px;top:20px;background:#5e6ad2;color:#fff;font-size:11px;line-height:1;padding:3px 6px;border-radius:4px;white-space:nowrap}
[data-agent-ripple]{position:fixed;width:28px;height:28px;margin:-14px 0 0 -14px;border-radius:50%;border:2px solid #5e6ad2;animation:agent-ripple .6s ease-out forwards;z-index:59}
@keyframes agent-ripple{from{transform:scale(.3);opacity:1}to{transform:scale(1.8);opacity:0}}
[data-agent-highlight]{position:fixed;border:2px solid #ffd166;border-radius:6px;box-shadow:0 0 0 4px rgba(255,209,102,.3);transition:opacity .3s;z-index:55}
[data-agent-bubble]{position:fixed;max-width:min(280px,calc(100vw - 16px));padding:6px 26px 6px 10px;background:#ffd166;color:#1a1405;font-size:13px;line-height:1.5;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,.25);pointer-events:auto;z-index:56;overflow-wrap:anywhere}
[data-agent-bubble] button{position:absolute;right:4px;top:3px;border:0;background:none;color:inherit;font-size:14px;line-height:1;cursor:pointer;padding:2px 4px}
[data-agent-tail]{position:absolute;width:10px;height:10px;background:#ffd166;transform:rotate(45deg)}
`;

const ARROW =
  '<svg width="24" height="24" viewBox="0 0 24 24"><path d="M4 2l15 9.5-6.6 1.4L16 20.5l-3 1.3-3.5-7.6L4 18z" fill="#5e6ad2" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/></svg>';

export interface AgentCursorOptions {
  doc: Document;
  /** 動きを待つ。テストでは待たずに返す。 */
  wait?: (ms: number) => Promise<void>;
  /** 要素が人から見えているか。 */
  visible?: (el: HTMLElement) => boolean;
}

export interface AgentCursor {
  run(agent: AgentAction): Promise<AgentResult>;
  destroy(): void;
}

function toRect(r: DOMRect): Rect {
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
}

export function createAgentCursor(options: AgentCursorOptions): AgentCursor {
  const { doc } = options;
  const wait = options.wait ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const visible = options.visible ?? isVisible;
  const view = doc.defaultView;

  const overlay = doc.createElement('div');
  overlay.setAttribute('data-agent-overlay', '');
  const style = doc.createElement('style');
  style.textContent = STYLE;
  overlay.appendChild(style);
  const cursor = doc.createElement('div');
  cursor.setAttribute('data-agent-cursor', '');
  cursor.innerHTML = `${ARROW}<span data-agent-tag>エージェント</span>`;
  cursor.style.opacity = '0';
  overlay.appendChild(cursor);
  doc.body.appendChild(overlay);

  let queue: Promise<unknown> = Promise.resolve();
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let bubble: HTMLElement | null = null;
  let bubbleTimer: ReturnType<typeof setTimeout> | undefined;
  let highlight: HTMLElement | null = null;
  let highlightTimer: ReturnType<typeof setTimeout> | undefined;

  function viewSize(): { width: number; height: number } {
    return { width: view?.innerWidth ?? 0, height: view?.innerHeight ?? 0 };
  }

  function keepAlive(): void {
    cursor.style.opacity = '1';
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => (cursor.style.opacity = '0'), IDLE_HIDE_MS);
  }

  async function moveTo(x: number, y: number): Promise<void> {
    keepAlive();
    // 矢印の先端（SVG の 4,2）を指す点に合わせる。
    cursor.style.transform = `translate(${x - 4}px, ${y - 2}px)`;
    await wait(MOVE_MS);
  }

  function closeBubble(): void {
    clearTimeout(bubbleTimer);
    bubble?.remove();
    bubble = null;
  }

  function showHighlight(rect: Rect): void {
    highlight?.remove();
    clearTimeout(highlightTimer);
    const box = doc.createElement('div');
    box.setAttribute('data-agent-highlight', '');
    Object.assign(box.style, {
      left: `${rect.left - 4}px`,
      top: `${rect.top - 4}px`,
      width: `${rect.right - rect.left + 8}px`,
      height: `${rect.bottom - rect.top + 8}px`,
    });
    overlay.appendChild(box);
    highlight = box;
    highlightTimer = setTimeout(() => {
      box.remove();
      if (highlight === box) highlight = null;
    }, HIGHLIGHT_MS);
  }

  function showBubble(message: string, target: Rect, seconds?: number): void {
    closeBubble();
    const el = doc.createElement('div');
    el.setAttribute('data-agent-bubble', '');
    el.setAttribute('role', 'status');
    const text = doc.createElement('span');
    text.textContent = message;
    const close = doc.createElement('button');
    close.type = 'button';
    close.setAttribute('aria-label', '吹き出しを閉じる');
    close.textContent = '×';
    close.addEventListener('click', closeBubble);
    const tail = doc.createElement('span');
    tail.setAttribute('data-agent-tail', '');
    el.append(text, close, tail);
    el.style.visibility = 'hidden';
    overlay.appendChild(el);

    const size = { width: el.offsetWidth, height: el.offsetHeight };
    const p = bubblePlacement(target, bubbleAnchor(target), size, viewSize());
    el.style.left = `${p.left}px`;
    el.style.top = `${p.top}px`;
    const t = tail.style;
    if (p.side === 'above' || p.side === 'below') {
      t.left = `${p.tail - 5}px`;
      t[p.side === 'above' ? 'bottom' : 'top'] = '-5px';
    } else {
      t.top = `${p.tail - 5}px`;
      t[p.side === 'right' ? 'left' : 'right'] = '-5px';
    }
    el.style.visibility = 'visible';
    bubble = el;

    // 読んでいる途中で消えないよう、指が乗っている間は残す。
    const schedule = (ms: number): void => {
      clearTimeout(bubbleTimer);
      bubbleTimer = setTimeout(() => {
        if (bubble === el) closeBubble();
      }, ms);
    };
    el.addEventListener('mouseenter', () => clearTimeout(bubbleTimer));
    el.addEventListener('mouseleave', () => schedule(HOVER_GRACE_MS));
    schedule(bubbleShowMs(message, seconds));
  }

  /** 対象へカーソルを運び、枠と吹き出しを出す。 */
  async function pointAt(el: HTMLElement, agent: AgentAction): Promise<Rect> {
    el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    const rect = toRect(el.getBoundingClientRect());
    const anchor = bubbleAnchor(rect);
    await moveTo(anchor.x, anchor.y);
    showHighlight(rect);
    if (agent.message) showBubble(agent.message, rect, agent.seconds);
    return rect;
  }

  function ripple(rect: Rect): void {
    const anchor = bubbleAnchor(rect);
    const el = doc.createElement('div');
    el.setAttribute('data-agent-ripple', '');
    el.style.left = `${anchor.x}px`;
    el.style.top = `${anchor.y}px`;
    overlay.appendChild(el);
    setTimeout(() => el.remove(), 600);
  }

  function typeInto(el: HTMLElement, value: string): void {
    el.focus();
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
      el.value = value;
    } else if (el.isContentEditable) {
      el.textContent = value;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function notFound(target: string): AgentResult {
    return { ok: false, error: `「${target}」が画面に見つかりません` };
  }

  function centerRect(): Rect {
    const { width, height } = viewSize();
    return { left: width / 2 - 40, top: height / 2 - 20, right: width / 2 + 40, bottom: height / 2 + 20 };
  }

  async function perform(agent: AgentAction): Promise<AgentResult> {
    switch (agent.action) {
      case 'say': {
        if (!agent.message) return { ok: false, error: '話す言葉（message）がありません' };
        if (agent.target) {
          const el = findTarget(doc, agent.target, visible);
          if (el === null) return notFound(agent.target);
          await pointAt(el, agent);
          return { ok: true };
        }
        showBubble(agent.message, centerRect(), agent.seconds);
        return { ok: true };
      }
      case 'point':
      case 'click':
      case 'type': {
        if (!agent.target) return { ok: false, error: '指す対象（target）がありません' };
        if (agent.action === 'type' && agent.value === undefined) {
          return { ok: false, error: '打つ値（value）がありません' };
        }
        const el = findTarget(doc, agent.target, visible);
        if (el === null) return notFound(agent.target);
        const rect = await pointAt(el, agent);
        if (agent.action === 'click') {
          ripple(rect);
          el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
          el.click();
        } else if (agent.action === 'type') {
          typeInto(el, agent.value ?? '');
        }
        return { ok: true };
      }
      case 'filter': {
        // この画面の絞り込みは検索欄だけ。無い画面で黙って成功にすると、依頼元は絞れたと思い込む。
        const el = doc.querySelector<HTMLInputElement>('input[type="search"]');
        if (el === null || !visible(el)) return { ok: false, error: 'この画面に絞り込みはありません' };
        await pointAt(el, agent);
        typeInto(el, agent.value ?? '');
        return { ok: true };
      }
      case 'go': {
        // この窓には URL で行き来する画面が無い。id を持つ場所なら、そこへ寄せて指す。
        const hash = (agent.hash ?? '').replace(/^#/, '');
        const el = hash === '' ? null : doc.getElementById(hash);
        if (el === null) return { ok: false, error: `移動先「${agent.hash ?? ''}」がこの画面にありません` };
        await pointAt(el, agent);
        return { ok: true };
      }
    }
  }

  return {
    run(agent: AgentAction): Promise<AgentResult> {
      const next = queue.then(() => perform(agent)).catch((e: unknown) => ({
        ok: false as const,
        error: e instanceof Error ? e.message : '画面で処理できませんでした',
      }));
      queue = next;
      return next;
    },
    destroy(): void {
      clearTimeout(idleTimer);
      clearTimeout(bubbleTimer);
      clearTimeout(highlightTimer);
      overlay.remove();
    },
  };
}
