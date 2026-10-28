import { describe, expect, it } from 'vitest';
import { mcpServers } from '../src/mcp/servers.js';

const runtime = {
  execPath: 'C:/Programs/Code/Code.exe',
  script: 'C:/ext/dist/mcp-server.cjs',
  version: '0.1.0',
};

describe('mcpServers', () => {
  it('offers nothing when no folder is open', () => {
    expect(mcpServers([], runtime)).toEqual([]);
  });

  it('starts one server per workspace folder, rooted at that folder', () => {
    const servers = mcpServers(
      [
        { name: 'docs', fsPath: 'C:/work/docs' },
        { name: 'site', fsPath: 'C:/work/site' },
      ],
      runtime,
    );
    expect(servers).toHaveLength(2);
    expect(servers[0]).toMatchObject({
      label: 'md-business: docs',
      command: runtime.execPath,
      args: [runtime.script, 'C:/work/docs'],
      version: '0.1.0',
    });
    expect(servers[1]?.args).toEqual([runtime.script, 'C:/work/site']);
  });

  it("runs the script with the editor's own Node instead of opening a window", () => {
    const [server] = mcpServers([{ name: 'docs', fsPath: 'C:/work/docs' }], runtime);
    expect(server?.env).toEqual({ ELECTRON_RUN_AS_NODE: '1' });
  });

  it('tells the server where to ask VS Code to open a file', () => {
    const [server] = mcpServers([{ name: 'docs', fsPath: 'C:/work/docs' }], {
      ...runtime,
      pipe: '\\\\.\\pipe\\md-business-vscode-abc',
    });
    expect(server?.env).toEqual({
      ELECTRON_RUN_AS_NODE: '1',
      MD_BUSINESS_EDITOR_PIPE: '\\\\.\\pipe\\md-business-vscode-abc',
    });
  });

  it('keeps labels apart when two folders share a name', () => {
    const servers = mcpServers(
      [
        { name: 'docs', fsPath: 'C:/a/docs' },
        { name: 'docs', fsPath: 'C:/b/docs' },
      ],
      runtime,
    );
    expect(servers.map((s) => s.label)).toEqual([
      'md-business: docs',
      'md-business: docs (C:/b/docs)',
    ]);
  });
});
