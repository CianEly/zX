export interface ApiConfig {
  port: string;
  token: string;
}

declare global {
  interface Window {
    ipcRenderer: {
      send: (channel: string, ...args: any[]) => void;
      on: (channel: string, listener: (event: any, ...args: any[]) => void) => void;
      off: (channel: string, listener: (event: any, ...args: any[]) => void) => void;
      invoke: (channel: string, ...args: any[]) => Promise<any>;
      getApiConfig: () => Promise<ApiConfig>;
      getSshHosts: () => Promise<string[]>;
      connectSsh: (params: { host: string; tunnelPort: number }) => Promise<{ success: boolean; error?: string }>;
      spawnLocalBackend: () => Promise<{ success: boolean; error?: string }>;
      onConnectionProgress: (callback: (data: { step: number; status: string; sub?: string }) => void) => void;
    };
  }
}
