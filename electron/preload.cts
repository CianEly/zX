const { ipcRenderer, contextBridge } = require('electron')

console.log('Preload script starting (CJS)...')

try {
  contextBridge.exposeInMainWorld('ipcRenderer', {
    send: (channel: string, ...args: any[]) => ipcRenderer.send(channel, ...args),
    on: (channel: string, listener: (...args: any[]) => void) => {
      ipcRenderer.on(channel, (_event: any, ...args: any[]) => listener(...args))
    },
    off: (channel: string, listener: (...args: any[]) => void) => {
      ipcRenderer.off(channel, (_event: any, ...args: any[]) => listener(...args))
    },
    invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args),
    getApiConfig: () => ipcRenderer.invoke('get-api-config'),
    getAppLogs: () => ipcRenderer.invoke('get-app-logs'),
    getSshHosts: () => ipcRenderer.invoke('get-ssh-hosts'),
    getConnectionState: () => ipcRenderer.invoke('get-connection-state'),
    selectDirectory: () => ipcRenderer.invoke('select-directory'),
    getRecentProjects: () => ipcRenderer.invoke('get-recent-projects'),
    addRecentProject: (params: { path: string; env: 'local' | 'remote' }) => ipcRenderer.invoke('add-recent-project', params),
    removeRecentProject: (path: string) => ipcRenderer.invoke('remove-recent-project', path),
    initProject: (params: { path: string; env: 'local' | 'remote' }) => ipcRenderer.invoke('init-project', params),
    uploadProject: (params: { localPath: string; remotePath: string }) => ipcRenderer.invoke('upload-project', params),
    listHooks: (projectPath: string, env: 'local' | 'remote') => ipcRenderer.invoke('list-hooks', { projectPath, env }),
    readHook: (projectPath: string, filename: string, env: 'local' | 'remote') => ipcRenderer.invoke('read-hook', { projectPath, filename, env }),
    writeHook: (projectPath: string, filename: string, content: string, env: 'local' | 'remote') => ipcRenderer.invoke('write-hook', { projectPath, filename, content, env }),
    listData: (params: { projectPath: string; env: 'local' | 'remote' }) => ipcRenderer.invoke('list-data', params),
    readData: (params: { projectPath: string; filename: string, env: 'local' | 'remote' }) => ipcRenderer.invoke('read-data', params),
    writeData: (params: { projectPath: string; filename: string, content: string, env: 'local' | 'remote' }) => ipcRenderer.invoke('write-data', params),
    importData: (params: { projectPath: string; env: 'local' | 'remote' }) => ipcRenderer.invoke('import-data', params),
    disconnect: () => ipcRenderer.invoke('disconnect'),
    connectSsh: (params: { host: string; tunnelPort: number; user?: string; password?: string; identityFile?: string }) => ipcRenderer.invoke('connect-ssh', params),
    spawnLocalBackend: () => ipcRenderer.invoke('spawn-local-backend'),
    resolvePath: (path: string) => ipcRenderer.invoke('resolve-path', path),
    onConnectionProgress: (callback: (data: any) => void) => {
      const listener = (_event: any, data: any) => callback(data)
      ipcRenderer.on('connection-progress', listener)
      return () => ipcRenderer.off('connection-progress', listener)
    },
    onAppLog: (callback: (data: string) => void) => {
      const listener = (_event: any, data: string) => callback(data)
      ipcRenderer.on('app-log', listener)
      return () => ipcRenderer.off('app-log', listener)
    },
    // ─── File Explorer IPC ──────────────────────────────────────────────────
    fsList: (params: { projectPath: string, env: 'local' | 'remote', targetPath?: string }) => ipcRenderer.invoke('fs-list', params),
    fsRead: (params: { path: string, env: 'local' | 'remote' }) => ipcRenderer.invoke('fs-read', params),
    fsDelete: (params: { path: string, env: 'local' | 'remote' }) => ipcRenderer.invoke('fs-delete', params),
    fsRename: (params: { oldPath: string, newPath: string, env: 'local' | 'remote' }) => ipcRenderer.invoke('fs-rename', params),
    // ─── Terminal IPC ───────────────────────────────────────────────────────
    createTerminal: (params: { terminalId: string; env: 'local' | 'remote'; cols: number; rows: number; cwd?: string }) =>
      ipcRenderer.send('create-terminal', params),
    writeTerminal: (terminalId: string, data: string) =>
      ipcRenderer.send('write-terminal', { terminalId, data }),
    resizeTerminal: (terminalId: string, cols: number, rows: number) =>
      ipcRenderer.send('resize-terminal', { terminalId, cols, rows }),
    closeTerminal: (terminalId: string) =>
      ipcRenderer.send('close-terminal', { terminalId }),
    onTerminalData: (terminalId: string, callback: (data: string) => void) => {
      const listener = (_event: any, data: string) => callback(data)
      ipcRenderer.on(`terminal-data:${terminalId}`, listener)
      return () => ipcRenderer.off(`terminal-data:${terminalId}`, listener)
    },
    onTerminalExit: (terminalId: string, callback: () => void) => {
      const listener = () => callback()
      ipcRenderer.on(`terminal-exit:${terminalId}`, listener)
      return () => ipcRenderer.off(`terminal-exit:${terminalId}`, listener)
    },
  })
  console.log('IPC Bridge exposed successfully')
} catch (e) {
  console.error('Failed to expose IPC Bridge:', e)
}
