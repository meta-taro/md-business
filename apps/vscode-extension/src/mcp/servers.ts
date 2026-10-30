export interface Folder {
  name: string;
  fsPath: string;
}

export interface Runtime {
  /** エディタ自身の実行ファイル。`ELECTRON_RUN_AS_NODE` を付けると Node として動く。 */
  execPath: string;
  /** 拡張に同梱した MCP サーバーのスクリプト。 */
  script: string;
  version: string;
  /** 「このファイルを画面に出して」を受け付ける口。無ければサーバーはデスクトップアプリで開く。 */
  pipe?: string;
}

export interface ServerSpec {
  label: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  version: string;
}

/**
 * 開いているワークスペースフォルダごとに、そのフォルダを root にした MCP サーバーを 1 本ずつ返す。
 *
 * 利用者に Node を入れてもらわずに済むよう、エディタに載っている Node でスクリプトを動かす。
 */
export function mcpServers(folders: readonly Folder[], runtime: Runtime): ServerSpec[] {
  const seen = new Set<string>();
  return folders.map((folder) => {
    // 同名のフォルダが並ぶと、ツール一覧でどちらのサーバーか見分けが付かない。
    const label = seen.has(folder.name)
      ? `md-business: ${folder.name} (${folder.fsPath})`
      : `md-business: ${folder.name}`;
    seen.add(folder.name);
    return {
      label,
      command: runtime.execPath,
      args: [runtime.script, folder.fsPath],
      env:
        runtime.pipe === undefined
          ? { ELECTRON_RUN_AS_NODE: '1' }
          : { ELECTRON_RUN_AS_NODE: '1', MD_BUSINESS_EDITOR_PIPE: runtime.pipe },
      version: runtime.version,
    };
  });
}
