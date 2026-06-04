export interface ApiConfig {
  port: string;
  token: string;
}

declare global {
  interface Window {
    ipcRenderer: {
      send: (channel: string, ...args: any[]) => void;
      on: (channel: string, listener: (...args: any[]) => void) => void;
      off: (channel: string, listener: (...args: any[]) => void) => void;
      invoke: (channel: string, ...args: any[]) => Promise<any>;
      getApiConfig: () => Promise<ApiConfig>;
      getSshHosts: () => Promise<string[]>;
      selectDirectory: () => Promise<{ canceled: boolean; filePaths: string[] }>;
      getRecentProjects: () => Promise<{ path: string; env: 'local' | 'remote' }[]>;
      addRecentProject: (params: { path: string; env: 'local' | 'remote' }) => Promise<{ path: string; env: 'local' | 'remote' }[]>;
      initProject: (params: { path: string; env: 'local' | 'remote' }) => Promise<{ success: boolean; error?: string }>;
      listHooks: (projectPath: string, env: 'local' | 'remote') => Promise<string[]>;
      readHook: (projectPath: string, filename: string, env: 'local' | 'remote') => Promise<string>;
      writeHook: (projectPath: string, filename: string, content: string, env: 'local' | 'remote') => Promise<{ success: boolean; error?: string }>;
      listData: (params: { projectPath: string; env: 'local' | 'remote' }) => Promise<string[]>;
      readData: (params: { projectPath: string; filename: string, env: 'local' | 'remote' }) => Promise<string>;
      writeData: (params: { projectPath: string; filename: string, content: string, env: 'local' | 'remote' }) => Promise<{ success: boolean; error?: string }>;
      importData: (params: { projectPath: string; env: 'local' | 'remote' }) => Promise<{ success: boolean; filename?: string; error?: string }>;
      disconnect: () => Promise<{ success: boolean }>;
      connectSsh: (params: { host: string; tunnelPort: number; user?: string; password?: string; identityFile?: string }) => Promise<{ success: boolean; error?: string }>;
      spawnLocalBackend: () => Promise<{ success: boolean; error?: string }>;
      onConnectionProgress: (callback: (data: { step: number; status: string; sub?: string }) => void) => () => void;
      // Terminal
      createTerminal: (params: { terminalId: string; env: 'local' | 'remote'; cols: number; rows: number; cwd?: string }) => void;
      writeTerminal: (terminalId: string, data: string) => void;
      resizeTerminal: (terminalId: string, cols: number, rows: number) => void;
      closeTerminal: (terminalId: string) => void;
      onTerminalData: (terminalId: string, callback: (data: string) => void) => () => void;
      onTerminalExit: (terminalId: string, callback: () => void) => () => void;
    };
  }
}
