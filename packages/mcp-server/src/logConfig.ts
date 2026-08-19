/**
 * 作業ログの設定 — ワークスペースの中（`.md-business/config.json`）を読む。
 * -----------------------------------------------------------------------------
 * 置き場をワークスペースにしたのは、このサーバーが 2 通りで起動するため。アプリが
 * 子として起こす形と、アプリ抜きで直に叩かれる形があり、アプリ側の設定は後者から
 * 見えない。ワークスペース単位なら、案件ごとに「ここは残す / 残さない」も分かれる。
 *
 * **設定ファイルは必須にしない。** 無ければ既定で動く。壊れていても既定へ倒して
 * 理由を返すだけで、起動は止めない（ログの設定で業務が止まるのは筋が違う）。
 */

/** 期限を過ぎた分の畳み方。 */
export type OnExpire = 'archive' | 'delete' | 'keep';

export interface LogConfig {
  /** 残すか。 */
  enabled: boolean;
  /** 手元に何日分置くか。 */
  retentionDays: number;
  /** 過ぎた分をどうするか。 */
  onExpire: OnExpire;
}

/**
 * 既定。
 *
 * - **残す**。ログは「何かあった後」に欲しくなるもので、そのとき有効にしても手遅れ
 * - **畳む**。消すのは戻せないので、既定を不可逆側に置かない
 */
export const DEFAULT_LOG_CONFIG: LogConfig = {
  enabled: true,
  retentionDays: 30,
  onExpire: 'archive',
};

const EXPIRE_KINDS: readonly string[] = ['archive', 'delete', 'keep'];

export interface ParsedLogConfig {
  config: LogConfig;
  /** 既定へ倒した理由。倒していなければ持たない。 */
  problem?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 設定の中身を読む。`text` が null は「設定ファイルが無い」。 */
export function parseLogConfig(text: string | null): ParsedLogConfig {
  if (text === null) return { config: { ...DEFAULT_LOG_CONFIG } };

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { config: { ...DEFAULT_LOG_CONFIG }, problem: 'config.json を読めませんでした' };
  }

  if (!isRecord(parsed) || parsed['log'] === undefined) return { config: { ...DEFAULT_LOG_CONFIG } };

  const log = parsed['log'];
  if (!isRecord(log)) {
    return { config: { ...DEFAULT_LOG_CONFIG }, problem: 'config.json の log が物ではありません' };
  }

  // 型の合わない項目だけ既定へ倒す。1 つの誤記で残り 2 つまで捨てる理由が無い。
  const config = { ...DEFAULT_LOG_CONFIG };
  const fallen: string[] = [];

  if (log['enabled'] !== undefined) {
    if (typeof log['enabled'] === 'boolean') config.enabled = log['enabled'];
    else fallen.push('enabled');
  }
  if (log['retentionDays'] !== undefined) {
    const days = log['retentionDays'];
    if (typeof days === 'number' && Number.isInteger(days) && days >= 0) config.retentionDays = days;
    else fallen.push('retentionDays');
  }
  if (log['onExpire'] !== undefined) {
    const kind = log['onExpire'];
    if (typeof kind === 'string' && EXPIRE_KINDS.includes(kind)) config.onExpire = kind as OnExpire;
    else fallen.push('onExpire');
  }

  if (fallen.length === 0) return { config };
  return { config, problem: `config.json の log: ${fallen.join(' / ')} を既定にしました` };
}
